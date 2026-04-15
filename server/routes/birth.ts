import { Router } from 'express';
import crypto from 'crypto';
import { nip19 } from 'nostr-tools';
import { statements } from '../db';

export const birthRouter = Router();

const PARENT_DOMAIN = process.env.BEING_PARENT_DOMAIN || 'lana.is';

// Default gestation: 2 hours. Configurable via env + per-request (for testing).
const DEFAULT_GESTATION_MS = parseInt(process.env.EMBRYO_GESTATION_MS || '7200000', 10);
const MIN_GESTATION_MS = 60_000;        // 1 minute
const MAX_GESTATION_MS = 7 * 86400_000; // 7 days

const NAME_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;
const WIF_RE = /^[5KL9c][a-zA-Z0-9]{50,51}$/;

// Subdomains that would collide with Lana infrastructure or standard DNS conventions.
const RESERVED_NAMES = new Set([
  'www', 'api', 'admin', 'mail', 'smtp', 'imap', 'pop', 'pop3',
  'incubator', 'localhost', 'root', 'ns', 'ns1', 'ns2', 'dns',
  'ftp', 'sftp', 'ssh', 'git', 'vpn', 'proxy', 'webmail',
  'relay', 'relays', 'lana', 'lanavault', 'vault', 'wallet',
  'pays', 'paper', 'nostr', 'test', 'staging', 'dev', 'prod',
  'production', 'status', 'monitor', 'grafana', 'prometheus',
]);

birthRouter.post('/beings/birth', async (req, res) => {
  const body = req.body || {};
  const {
    owner_hex,
    name,
    language,
    vision,
    being_nsec,
    being_npub,
    being_hex_priv,
    being_hex_pub,
    being_wif,
    being_wallet,
    gestation_ms,
  } = body;

  // ── Validation ────────────────────────────────────────
  if (!HEX64_RE.test(owner_hex || '')) return res.status(400).json({ error: 'Invalid owner_hex' });
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid name (3-32 chars, lowercase, a-z 0-9 -)' });
  }
  if (RESERVED_NAMES.has(name)) {
    return res.status(400).json({ error: 'That name is reserved. Please choose another.' });
  }
  if (being_wif !== undefined && being_wif !== null && being_wif !== '' &&
      (typeof being_wif !== 'string' || !WIF_RE.test(being_wif))) {
    return res.status(400).json({ error: 'Invalid Lana WIF format' });
  }
  if (!HEX64_RE.test(being_hex_priv || '') || !HEX64_RE.test(being_hex_pub || '')) {
    return res.status(400).json({ error: 'Invalid being hex keys' });
  }
  if (typeof being_nsec !== 'string' || !being_nsec.startsWith('nsec1')) {
    return res.status(400).json({ error: 'Invalid being nsec' });
  }
  if (typeof being_npub !== 'string' || !being_npub.startsWith('npub1')) {
    return res.status(400).json({ error: 'Invalid being npub' });
  }

  // ── Existing being / embryo? ──────────────────────────
  if (statements.getBeingByOwner.get(owner_hex)) {
    return res.status(409).json({ error: 'Owner already has a Being' });
  }
  if (statements.getEmbryoByOwner.get(owner_hex)) {
    return res.status(409).json({ error: 'Owner already has a gestating Embryo' });
  }
  if (statements.getBeingByName.get(name) || statements.getEmbryoByName.get(name)) {
    return res.status(409).json({ error: 'Name already taken' });
  }

  const domain = `${name}.${PARENT_DOMAIN}`;
  const now = Date.now();

  // Clamp gestation
  let gestation = Number.isFinite(gestation_ms) ? Number(gestation_ms) : DEFAULT_GESTATION_MS;
  if (gestation < MIN_GESTATION_MS) gestation = MIN_GESTATION_MS;
  if (gestation > MAX_GESTATION_MS) gestation = MAX_GESTATION_MS;

  const conceived_at = Math.floor(now / 1000);
  const birth_at = Math.floor((now + gestation) / 1000);

  const id = crypto.randomBytes(12).toString('hex');

  // Guarantee users row for owner_hex before conceiving embryo. The finalize
  // step (gestation.ts) inserts into beings_owners which has a FK to users(hex);
  // if the owner has not passed through NIP-07 auth (upsertUser), that FK
  // would fail 60+ seconds later after the container is already running.
  // INSERT OR IGNORE is a no-op when the login flow already populated the row.
  try {
    const owner_npub = nip19.npubEncode(owner_hex);
    statements.ensureUser.run({ hex: owner_hex, npub: owner_npub, now });
  } catch (err: any) {
    console.error('[embryo] ensureUser failed:', err?.message);
    return res.status(500).json({ error: 'Could not register owner' });
  }

  try {
    statements.insertEmbryo.run({
      id,
      owner_hex,
      name,
      domain,
      npub: being_npub,
      hex_pub: being_hex_pub,
      hex_priv: being_hex_priv,
      nsec: being_nsec,
      wif: being_wif || null,
      wallet: being_wallet || null,
      language: language || 'english',
      vision: vision || '',
      father_hex: owner_hex,
      conceived_at,
      birth_at,
    });
  } catch (err: any) {
    console.error('[embryo] insert failed:', err?.message);
    return res.status(500).json({ error: 'Could not conceive Embryo' });
  }

  console.log(`[embryo] 🌱 conceived ${name} (${id}) — birth in ${Math.round(gestation / 1000)}s → ${new Date(birth_at * 1000).toISOString()}`);

  res.json({
    ok: true,
    embryo_id: id,
    name,
    domain,
    conceived_at,
    birth_at,
    gestation_ms: gestation,
  });
});

// ── GET /api/embryo/:id — status + progress ─────────────────
birthRouter.get('/embryo/:id', (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f]{8,64}$/.test(id)) return res.status(400).json({ error: 'Invalid id' });

  const row = statements.getEmbryoById.get(id) as any;
  if (!row) return res.status(404).json({ error: 'Embryo not found' });

  const now_s = Math.floor(Date.now() / 1000);
  const total = Math.max(1, row.birth_at - row.conceived_at);
  const elapsed = Math.max(0, Math.min(total, now_s - row.conceived_at));
  const progress = row.status === 'birthed' ? 1 : elapsed / total;
  const time_remaining_ms = Math.max(0, (row.birth_at - now_s) * 1000);

  res.json({
    id: row.id,
    name: row.name,
    domain: row.domain,
    npub: row.npub,
    language: row.language,
    vision: row.vision,
    conceived_at: row.conceived_at,
    birth_at: row.birth_at,
    birthed_at: row.birthed_at,
    status: row.status,
    progress,
    time_remaining_ms,
    event_id: row.event_id,
    birth_error: row.birth_error,
    now: now_s,
  });
});

// ── GET /api/embryo/:id/thoughts — public live feed ────────
birthRouter.get('/embryo/:id/thoughts', (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f]{8,64}$/.test(id)) return res.status(400).json({ error: 'Invalid id' });

  const row = statements.getEmbryoById.get(id) as any;
  if (!row) return res.status(404).json({ error: 'Embryo not found' });

  const since = parseInt((req.query.since as string) || '0', 10) || 0;
  const all = statements.getThoughtsByEmbryo.all(id) as Array<{
    id: number; created_at: number; phase: string; progress: number; content: string;
  }>;
  const thoughts = since > 0 ? all.filter((t) => t.id > since) : all;

  res.json({
    embryo_id: id,
    name: row.name,
    language: row.language,
    count: all.length,
    thoughts,
  });
});
