import WebSocket from 'ws';

export const LANA_RELAYS = [
  'wss://relay.lanavault.space',
  'wss://relay.lanacoin-eternity.com',
];

export const KIND_38888_PUBKEY = '9eb71bf1e9c3189c78800e4c3831c1c1a93ab43b61118818c32e4490891a35b3';

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface ElectrumServerEntry {
  host: string;
  port: number;
}

export interface Kind38888Data {
  event_id: string;
  pubkey: string;
  created_at: number;
  relays: string[];
  electrum_servers: ElectrumServerEntry[];
  exchange_rates: { EUR: number; USD: number; GBP: number };
  split: string;
  split_target_lana: number;
  split_started_at: number;
  split_ends_at: number;
  version: string;
  valid_from: number;
  raw_event: string;
}

function parseKind38888(event: NostrEvent): Kind38888Data {
  let content: any = {};
  try {
    content = typeof event.content === 'string' && event.content.trim().startsWith('{')
      ? JSON.parse(event.content)
      : {};
  } catch { /* ignore */ }
  const tags = event.tags;
  const relays = tags.filter((t) => t[0] === 'relay').map((t) => t[1]);
  const electrum_servers: ElectrumServerEntry[] = tags
    .filter((t) => t[0] === 'electrum')
    .map((t) => ({ host: t[1], port: parseInt(t[2] || '5097', 10) }));
  const fxTags = tags.filter((t) => t[0] === 'fx');
  const exchange_rates = {
    EUR: parseFloat(fxTags.find((t) => t[1] === 'EUR')?.[2] || content.exchange_rates?.EUR || '0'),
    USD: parseFloat(fxTags.find((t) => t[1] === 'USD')?.[2] || content.exchange_rates?.USD || '0'),
    GBP: parseFloat(fxTags.find((t) => t[1] === 'GBP')?.[2] || content.exchange_rates?.GBP || '0'),
  };
  const split = tags.find((t) => t[0] === 'split')?.[1] || content.split || '';
  const split_target_lana = parseInt(tags.find((t) => t[0] === 'split_target_lana')?.[1] || content.split_target_lana || '0');
  const split_started_at = parseInt(tags.find((t) => t[0] === 'split_started_at')?.[1] || content.split_started_at || '0');
  const split_ends_at = parseInt(tags.find((t) => t[0] === 'split_ends_at')?.[1] || content.split_ends_at || '0');
  const version = tags.find((t) => t[0] === 'version')?.[1] || content.version || '1';
  const valid_from = parseInt(tags.find((t) => t[0] === 'valid_from')?.[1] || content.valid_from || '0');
  return {
    event_id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    relays: relays.length > 0 ? relays : content.relays || LANA_RELAYS,
    electrum_servers: electrum_servers.length > 0 ? electrum_servers : (content.electrum || []),
    exchange_rates,
    split,
    split_target_lana,
    split_started_at,
    split_ends_at,
    version,
    valid_from,
    raw_event: JSON.stringify(event),
  };
}

function fetchFromRelay(relayUrl: string, filter: any, timeout = 8000): Promise<NostrEvent | null> {
  return new Promise((resolve) => {
    let ws: WebSocket;
    const timer = setTimeout(() => {
      try { ws?.close(); } catch {}
      resolve(null);
    }, timeout);
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      clearTimeout(timer);
      resolve(null);
      return;
    }
    const subId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    ws.on('open', () => {
      ws.send(JSON.stringify(['REQ', subId, filter]));
    });
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg[0] === 'EVENT' && msg[1] === subId) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(msg[2] as NostrEvent);
        } else if (msg[0] === 'EOSE' && msg[1] === subId) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(null);
        }
      } catch { /* ignore */ }
    });
    ws.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    ws.on('close', () => clearTimeout(timer));
  });
}

export async function fetchKind38888(): Promise<Kind38888Data | null> {
  const filter = {
    kinds: [38888],
    authors: [KIND_38888_PUBKEY],
    '#d': ['main'],
    limit: 1,
  };
  const results = await Promise.all(LANA_RELAYS.map((r) => fetchFromRelay(r, filter)));
  const valid = results.filter((e): e is NostrEvent => e !== null && e.pubkey === KIND_38888_PUBKEY && e.kind === 38888);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.created_at - a.created_at);
  return parseKind38888(valid[0]);
}

export interface Kind0Profile {
  name?: string;
  display_name?: string;
  picture?: string;
  currency?: string;
  lang?: string;
}

export async function fetchKind0Profile(hexId: string, relays = LANA_RELAYS): Promise<Kind0Profile | null> {
  const filter = { kinds: [0], authors: [hexId], limit: 1 };
  const results = await Promise.all(relays.map((r) => fetchFromRelay(r, filter, 5000)));
  const events = results.filter((e): e is NostrEvent => e !== null && e.kind === 0);
  if (events.length === 0) return null;
  events.sort((a, b) => b.created_at - a.created_at);
  const event = events[0];
  try {
    const content = JSON.parse(event.content);
    const langTag = (event.tags || []).find((t) => t[0] === 'lang');
    return {
      name: content.name,
      display_name: content.display_name,
      picture: content.picture,
      currency: content.currency,
      lang: langTag?.[1] || content.language,
    };
  } catch {
    return null;
  }
}
