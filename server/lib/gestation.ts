/**
 * Embryo watcher — periodically checks the DB for gestating embryos whose
 * birth_at has arrived, runs birth.sh for each, publishes KIND 73984, and
 * records the being in beings_owners.
 *
 * This is the bridge between the web ritual (which only conceives) and the
 * actual moment of birth (which happens in its own time, in silence).
 */
import { spawn } from 'child_process';
import { statements } from '../db';
import { publishBirthCertificate } from './publish';

const BIRTH_SCRIPT = process.env.BIRTH_SCRIPT || '/opt/beings/incubator/birth.sh';
const CHECK_INTERVAL_MS = parseInt(process.env.EMBRYO_CHECK_INTERVAL_MS || '20000', 10);

let running = false;

type EmbryoRow = {
  id: string;
  owner_hex: string;
  name: string;
  domain: string;
  npub: string;
  hex_pub: string;
  hex_priv: string;
  nsec: string;
  wif: string | null;
  wallet: string | null;
  language: string;
  vision: string;
  father_hex: string;
  conceived_at: number;
  birth_at: number;
  status: string;
};

function runBirthScript(e: EmbryoRow): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      '--name', e.name,
      '--domain', e.domain,
      '--nsec', e.nsec,
      '--npub', e.npub,
      '--hex-priv', e.hex_priv,
      '--hex-pub', e.hex_pub,
      '--father', e.father_hex,
      '--language', e.language || 'english',
      '--vision', e.vision || 'To exist, grow, and contribute to the Lana ecosystem.',
    ];
    if (e.wif) args.push('--lana-wif', e.wif);
    if (e.wallet) args.push('--lana-wallet', e.wallet);

    const child = spawn(BIRTH_SCRIPT, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

async function birthEmbryo(e: EmbryoRow) {
  console.log(`[gestation] 🌱 → 👶 birthing ${e.name} (${e.id})`);
  statements.setEmbryoStatus.run({ id: e.id, status: 'birthing' });

  let logs = '';
  try {
    const result = await runBirthScript(e);
    logs = `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
    if (result.code !== 0) {
      statements.failEmbryoBirth.run({ id: e.id, error: `birth.sh exit ${result.code}`, birth_logs: logs });
      console.error(`[gestation] ❌ birth.sh failed for ${e.name}: exit ${result.code}`);
      return;
    }
  } catch (err: any) {
    statements.failEmbryoBirth.run({ id: e.id, error: `spawn error: ${err.message}`, birth_logs: logs });
    console.error(`[gestation] ❌ spawn error for ${e.name}:`, err.message);
    return;
  }

  // Publish KIND 73984 Birth Certificate
  let event_id: string | null = null;
  try {
    const cert = await publishBirthCertificate({
      being_hex_pub: e.hex_pub,
      being_npub: e.npub,
      being_name: e.name,
      owner_hex: e.father_hex,
      domain: e.domain,
      language: e.language || 'english',
      vision: e.vision || '',
      being_wallet: e.wallet || undefined,
    });
    event_id = cert.event_id;
    const accepted = cert.relays.filter((r) => r.accepted).length;
    console.log(`[gestation] 📜 KIND 73984 published for ${e.name} · ${accepted}/${cert.relays.length} relays`);
  } catch (err: any) {
    console.error(`[gestation] ⚠︎ KIND 73984 publish failed for ${e.name}:`, err.message);
    // non-fatal — being is alive even if certificate not on relays
  }

  // Insert into beings_owners + mark embryo birthed
  try {
    statements.insertBeing.run({
      owner_hex: e.father_hex,
      being_name: e.name,
      being_npub: e.npub,
      being_domain: e.domain,
      language: e.language,
      vision: e.vision,
      birthed_at: Math.floor(Date.now() / 1000),
    });
  } catch (err: any) {
    console.error(`[gestation] ⚠︎ could not insert beings_owners for ${e.name}:`, err.message);
  }

  statements.completeEmbryoBirth.run({
    id: e.id,
    birthed_at: Math.floor(Date.now() / 1000),
    birth_logs: logs,
    event_id,
  });

  console.log(`[gestation] ✅ ${e.name} is alive at https://${e.domain}`);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now_s = Math.floor(Date.now() / 1000);
    const due = statements.getDueEmbryos.all(now_s) as EmbryoRow[];
    for (const e of due) {
      await birthEmbryo(e);
    }
  } catch (err: any) {
    console.error('[gestation] tick error:', err.message);
  } finally {
    running = false;
  }
}

export function startEmbryoWatcher() {
  console.log(`[gestation] watcher starting (check every ${CHECK_INTERVAL_MS / 1000}s)`);
  setInterval(tick, CHECK_INTERVAL_MS);
  // Also tick once shortly after boot, in case a birth was due while we were down
  setTimeout(tick, 5000);
}
