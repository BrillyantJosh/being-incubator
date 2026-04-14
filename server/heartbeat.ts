import { fetchKind38888 } from './lib/nostr';
import { statements } from './db';

const HEARTBEAT_INTERVAL_MS = 60_000; // 1 minute

async function tick() {
  try {
    const data = await fetchKind38888();
    if (data) {
      statements.upsertKind38888.run({
        event_id: data.event_id,
        version: data.version,
        relays_json: JSON.stringify(data.relays),
        updated_at: Math.floor(Date.now() / 1000),
      });
      console.log(`[heartbeat] KIND 38888 updated: v${data.version}, ${data.relays.length} relays`);
    }
  } catch (err) {
    console.warn('[heartbeat] error:', err);
  }
}

export function startHeartbeat() {
  tick();
  setInterval(tick, HEARTBEAT_INTERVAL_MS);
}
