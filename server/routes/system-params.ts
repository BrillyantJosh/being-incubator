import { Router } from 'express';
import { execFileSync } from 'child_process';
import { statements } from '../db';

export const systemParamsRouter = Router();

const BEING_IMAGE = process.env.BEING_IMAGE || 'being3:latest';

// GET /api/incubator-version — which code will a newborn actually run?
//
// This used to read a stamp file that space-between's deploy.sh wrote. That
// answer was true until 2026-08-08, when births moved to being3 — after which
// the page kept telling every visitor their being would be built from a
// space-between commit that no newborn had touched for months. A stamp is a
// promise made by whoever last remembered to write it.
//
// So ask the thing itself. birth.sh runs `docker compose up -d` with this
// image, and this container has the docker socket to do exactly that, so the
// image IS the answer — and it cannot drift, because it is the same object
// the birth uses. BEING_VERSION comes from the build arg when set; otherwise
// the short image digest identifies the build unambiguously.
type VersionInfo = { version: string; sha: string | null; date: string | null; branch: string | null; deployed_at: string | null };
let cached: { at: number; value: VersionInfo } | null = null;
const CACHE_MS = 60_000;

const readImageVersion = (): VersionInfo => {
  const out = execFileSync(
    'docker',
    ['image', 'inspect', BEING_IMAGE, '--format', '{{.Id}}\t{{.Created}}\t{{range .Config.Env}}{{println .}}{{end}}'],
    { encoding: 'utf8', timeout: 5000 },
  );
  const [id, created, ...envLines] = out.split('\t');
  const sha = (id || '').replace(/^sha256:/, '').slice(0, 12) || null;
  const stamped = envLines.join('\t').split('\n').find((l) => l.startsWith('BEING_VERSION='));
  const version = stamped ? stamped.slice('BEING_VERSION='.length).trim() : '';
  return {
    version: version || sha || 'unknown',
    sha,
    date: created ? created.slice(0, 10) : null,
    branch: null,
    deployed_at: created || null,
  };
};

systemParamsRouter.get('/incubator-version', (_req, res) => {
  if (cached && Date.now() - cached.at < CACHE_MS) return res.json(cached.value);
  try {
    const value = readImageVersion();
    cached = { at: Date.now(), value };
    res.json(value);
  } catch {
    // The image is genuinely missing or docker is unreachable — and in that
    // case a newborn would not start at all. 'unknown' is the honest answer,
    // and the birth page already renders it as a warning.
    res.json({ version: 'unknown', sha: null, date: null, branch: null, deployed_at: null });
  }
});

// GET /api/incubator-config — public, read-only view of the few timings the
// incubator still owns. Birth.tsx uses breath_duration_ms for the opening
// silence; the actual birth date/time is now chosen by the creator.
systemParamsRouter.get('/incubator-config', (_req, res) => {
  const settings = statements.getAdminSettings.get() as
    | { breath_duration_ms: number }
    | undefined;
  const breath_ms    = settings?.breath_duration_ms ?? 732_000;

  const now_s = Math.floor(Date.now() / 1000);
  const queueRow = statements.getQueueSize.get() as { n: number };

  res.json({
    breath_duration_ms: breath_ms,
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
