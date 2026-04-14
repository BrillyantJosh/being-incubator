import { fetchKind38888 } from './lib/nostr';
import { statements } from './db';

const HEARTBEAT_INTERVAL_MS = 60_000; // 1 minute
const MAX_DURATION_MS = 120_000;

let running = false;
let startedAt = 0;

async function tick() {
  if (running) {
    if (Date.now() - startedAt > MAX_DURATION_MS) {
      console.warn('[heartbeat] stuck — force resetting lock');
      running = false;
    } else {
      return;
    }
  }
  running = true;
  startedAt = Date.now();
  const now = Math.floor(Date.now() / 1000);
  const logResult = statements.insertHeartbeatLog.run(now);
  const logId = Number(logResult.lastInsertRowid);

  try {
    const data = await fetchKind38888();
    if (!data) throw new Error('KIND 38888 not available on any relay');

    statements.upsertKind38888.run({
      event_id: data.event_id,
      pubkey: data.pubkey,
      created_at: data.created_at,
      version: data.version,
      valid_from: data.valid_from,
      relays_json: JSON.stringify(data.relays),
      electrum_json: JSON.stringify(data.electrum_servers || []),
      exchange_rates_json: JSON.stringify(data.exchange_rates),
      split: data.split,
      split_target_lana: data.split_target_lana,
      split_started_at: data.split_started_at,
      split_ends_at: data.split_ends_at,
      raw_event: data.raw_event,
      updated_at: now,
    });

    console.log(
      `[heartbeat] v${data.version} · ${data.relays.length} relays · ${(data.electrum_servers || []).length} electrum · ` +
      `split=${data.split || '—'} · EUR=${data.exchange_rates.EUR} USD=${data.exchange_rates.USD} GBP=${data.exchange_rates.GBP}`
    );

    statements.updateHeartbeatLog.run({
      id: logId,
      completed_at: Math.floor(Date.now() / 1000),
      success: 1,
      error: null,
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    console.warn('[heartbeat] error:', message);
    statements.updateHeartbeatLog.run({
      id: logId,
      completed_at: Math.floor(Date.now() / 1000),
      success: 0,
      error: message,
    });
  } finally {
    try { statements.pruneHeartbeatLogs.run(); } catch {}
    running = false;
  }
}

export function startHeartbeat() {
  console.log('[heartbeat] starting (interval 60s)');
  tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS);
}
