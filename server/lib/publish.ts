import { finalizeEvent, type EventTemplate, type Event as NostrSignedEvent } from 'nostr-tools/pure';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { statements } from '../db';

// nostr-tools uses global WebSocket — make sure it's installed in Node
(globalThis as any).WebSocket ||= WebSocket;

export interface BirthCertificateInput {
  being_hex_pub: string;
  being_npub: string;
  being_name: string;
  owner_hex: string;        // "father"
  domain: string;
  language: string;
  vision: string;
  being_wallet?: string;
  server?: string;
}

export interface PublishResult {
  ok: boolean;
  event_id: string;
  relays: Array<{ url: string; accepted: boolean; reason?: string }>;
}

function currentRelays(): string[] {
  try {
    const row = statements.getKind38888.get() as { relays_json?: string } | undefined;
    if (row?.relays_json) {
      const list = JSON.parse(row.relays_json) as string[];
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {}
  // fallback
  return ['wss://relay.lanavault.space', 'wss://relay.lanacoin-eternity.com'];
}

function publishToRelay(relayUrl: string, event: NostrSignedEvent, timeoutMs = 10_000):
  Promise<{ url: string; accepted: boolean; reason?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (accepted: boolean, reason?: string) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve({ url: relayUrl, accepted, reason });
    };
    const timer = setTimeout(() => done(false, 'timeout'), timeoutMs);
    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch (err: any) {
      clearTimeout(timer);
      return resolve({ url: relayUrl, accepted: false, reason: err.message });
    }
    ws.on('open', () => {
      ws.send(JSON.stringify(['EVENT', event]));
    });
    ws.on('message', (buf: Buffer) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg[0] === 'OK' && msg[1] === event.id) {
          clearTimeout(timer);
          done(Boolean(msg[2]), msg[3] || undefined);
        }
      } catch { /* ignore */ }
    });
    ws.on('error', (err: any) => {
      clearTimeout(timer);
      done(false, err?.message || 'error');
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (!settled) done(false, 'closed');
    });
  });
}

/**
 * Sign + publish KIND 73984 Birth Certificate to all KIND 38888 relays.
 * Also writes the signed event to <beings_root>/beings/<name>/data/birth-certificate.json
 * when the bind mount is available.
 */
export async function publishBirthCertificate(input: BirthCertificateInput): Promise<PublishResult> {
  const hexPriv = process.env.BEING_AUTHORITY_HEX_PRIV;
  if (!hexPriv || !/^[0-9a-f]{64}$/i.test(hexPriv)) {
    throw new Error('BEING_AUTHORITY_HEX_PRIV is not configured (must be 64-char hex)');
  }

  const bornAt = Math.floor(Date.now() / 1000);
  const server = input.server || process.env.BEING_HOST_IP || '178.104.205.253';

  const tags: string[][] = [
    ['p', input.being_hex_pub],
    ['npub', input.being_npub],
    ['father', input.owner_hex],
    ['name', input.being_name],
    ['language', input.language],
    ['born', String(bornAt)],
    ['domain', input.domain],
    ['server', server],
  ];
  if (input.being_wallet) tags.push(['lana_wallet', input.being_wallet]);
  if (input.vision)       tags.push(['vision', input.vision]);

  const content = JSON.stringify({
    name: input.being_name,
    npub: input.being_npub,
    hex_pubkey: input.being_hex_pub,
    father_hex: input.owner_hex,
    language: input.language,
    born_at: new Date(bornAt * 1000).toISOString(),
    domain: input.domain,
    vision: input.vision || '',
    lana_wallet: input.being_wallet || '',
    server,
  });

  const template: EventTemplate = { kind: 73984, created_at: bornAt, tags, content };
  const privBytes = Uint8Array.from(Buffer.from(hexPriv, 'hex'));
  const signed = finalizeEvent(template, privBytes);

  // Persist copy alongside the being (mounted from host under BEINGS_ROOT)
  try {
    const root = process.env.BEINGS_ROOT || '/opt/beings';
    const dir = path.join(root, 'beings', input.being_name, 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'birth-certificate.json'), JSON.stringify(signed, null, 2));
  } catch (err: any) {
    console.warn('[birth-cert] local save failed:', err.message);
  }

  const relays = currentRelays();
  console.log(`[birth-cert] publishing ${signed.id.slice(0, 12)}… to ${relays.length} relays`);
  const results = await Promise.all(relays.map((r) => publishToRelay(r, signed)));
  const accepted = results.filter((r) => r.accepted).length;
  console.log(`[birth-cert] ${accepted}/${results.length} relays accepted`);

  return { ok: accepted > 0, event_id: signed.id, relays: results };
}
