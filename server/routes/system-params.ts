import { Router } from 'express';
import fs from 'fs';
import { statements } from '../db';

export const systemParamsRouter = Router();

const STAMP_PATH = process.env.SPACE_BETWEEN_STAMP_PATH || '/opt/beings/incubator/current-space-between.txt';

// GET /api/incubator-version — which space-between version will newborn
// beings be built from? Reads the stamp file written by space-between's
// deploy.sh on the incubator host.
systemParamsRouter.get('/incubator-version', (_req, res) => {
  try {
    const raw = fs.readFileSync(STAMP_PATH, 'utf8');
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([a-z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    res.json({
      version: out.version || 'unknown',
      sha: out.sha || null,
      date: out.date || null,
      branch: out.branch || null,
      deployed_at: out.deployed_at || null,
    });
  } catch {
    res.json({ version: 'unknown', sha: null, date: null, branch: null, deployed_at: null });
  }
});

// GET /api/incubator-config — public, read-only view of the timings the
// incubator currently uses. Birth.tsx fetches this so the silent breath
// step matches the admin-configured duration, and so we can preview the
// next-slot birth ETA to the visitor before they commit to conception.
systemParamsRouter.get('/incubator-config', (_req, res) => {
  const settings = statements.getAdminSettings.get() as
    | { breath_duration_ms: number; birth_spacing_ms: number }
    | undefined;
  const breath_ms  = settings?.breath_duration_ms ?? 732_000;
  const spacing_ms = settings?.birth_spacing_ms   ?? 48_000;

  // Predict the next available birth slot (if a conception happened right now).
  const now_s = Math.floor(Date.now() / 1000);
  const minBirth_s = now_s + Math.ceil(breath_ms / 1000);
  const latestRow = statements.getLatestQueuedBirthAt.get() as { latest_birth_at: number | null };
  const latest = latestRow?.latest_birth_at ?? 0;
  const spaced_s = latest > 0 ? latest + Math.ceil(spacing_ms / 1000) : 0;
  const next_slot_birth_at = Math.max(minBirth_s, spaced_s);

  const queueRow = statements.getQueueSize.get() as { n: number };

  res.json({
    breath_duration_ms: breath_ms,
    birth_spacing_ms: spacing_ms,
    next_slot_birth_at,
    queue_size: queueRow?.n ?? 0,
    server_now: now_s,
  });
});

systemParamsRouter.get('/system-params', (_req, res) => {
  const row = statements.getKind38888.get() as any;
  if (!row) return res.json(null);

  const parse = <T>(s: string | null | undefined, fallback: T): T => {
    if (!s) return fallback;
    try { return JSON.parse(s) as T; } catch { return fallback; }
  };

  res.json({
    event_id: row.event_id,
    pubkey: row.pubkey,
    created_at: row.created_at,
    version: row.version,
    valid_from: row.valid_from,
    relays: parse<string[]>(row.relays_json, []),
    electrum_servers: parse<Array<{ host: string; port: number }>>(row.electrum_json, []),
    exchange_rates: parse<{ EUR: number; USD: number; GBP: number }>(
      row.exchange_rates_json,
      { EUR: 0, USD: 0, GBP: 0 },
    ),
    split: row.split,
    split_target_lana: row.split_target_lana,
    split_started_at: row.split_started_at,
    split_ends_at: row.split_ends_at,
    updated_at: row.updated_at,
  });
});
