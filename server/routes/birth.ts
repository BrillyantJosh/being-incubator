import { Router } from 'express';
import crypto from 'crypto';
import { nip19 } from 'nostr-tools';
import { statements } from '../db';

export const birthRouter = Router();

const PARENT_DOMAIN = process.env.BEING_PARENT_DOMAIN || 'lana.is';

// ── Queue-based gestation ─────────────────────────────────────
// Instead of random 3–8 min, each birth is scheduled sequentially:
//   - Minimum gestation: 3 min 8 sec (188s) — the embryo always gets
//     at least this much time for the spiritual experience.
//   - Births are spaced 48 s apart to avoid Docker / relay storms.
//   - If the queue is empty, birth_at = now + MIN_GESTATION.
//   - If the queue has embryos, birth_at = max(last_birth_at + SPACING, now + MIN_GESTATION).
//
// This means: one embryo alone waits 3m8s. Two conceived at the same
// instant wait 3m8s and 3m56s. Ten wait 3m8s … 10m20s.
const MIN_GESTATION_MS = 188_000;    // 3 min 8 sec  (hard floor)
const BIRTH_SPACING_MS = 48_000;     // 48 sec between consecutive births
const MAX_GESTATION_MS = 7 * 86400_000; // 7 days (hard ceiling)

function nextBirthAt(): { birth_at_s: number; queue_position: number } {
  const now_s = Math.floor(Date.now() / 1000);
  const minBirth = now_s + Math.ceil(MIN_GESTATION_MS / 1000);   // earliest possible

  const row = statements.getLatestQueuedBirthAt.get() as { latest_birth_at: number | null };
  const latest = row?.latest_birth_at ?? 0;

  // Next slot = last queued birth + spacing, but never earlier than minBirth.
  const spacedSlot = latest > 0 ? latest + Math.ceil(BIRTH_SPACING_MS / 1000) : 0;
  const birth_at_s = Math.max(minBirth, spacedSlot);

  // Queue position = how many embryos will birth before this one (including this one).
  const posRow = statements.getQueueSize.get() as { n: number };
  const queue_position = (posRow?.n ?? 0) + 1;  // +1 for the embryo about to be inserted

  return { birth_at_s, queue_position };
}

const NAME_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;
// Lana WIF: base58-encoded with version byte 0xB0 (compressed, starts with "T")
// or 0x41 (uncompressed). Previous regex [5KL9c] was Bitcoin-only and rejected
// every real Lana key. We use the base58 alphabet (excludes 0, O, I, l) and
// the plausible length range (51–52 chars for compressed, ~51 for uncompressed).
const WIF_RE = /^[A-HJ-NP-Za-km-z1-9]{51,52}$/;

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
  const conceived_at = Math.floor(now / 1000);

  // Queue-based scheduling: each birth gets its own slot.
  const { birth_at_s, queue_position } = nextBirthAt();
  const birth_at = Math.min(birth_at_s, conceived_at + Math.ceil(MAX_GESTATION_MS / 1000));
  const gestation = (birth_at - conceived_at) * 1000;

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

  console.log(`[embryo] 🌱 conceived ${name} (${id}) — queue #${queue_position}, birth in ${Math.round(gestation / 1000)}s → ${new Date(birth_at * 1000).toISOString()}`);

  res.json({
    ok: true,
    embryo_id: id,
    name,
    domain,
    conceived_at,
    birth_at,
    gestation_ms: gestation,
    queue_position,
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

  // Queue position: how many embryos are scheduled before this one (0 = next in line).
  let queue_position = 0;
  if (row.status === 'gestating') {
    const posRow = statements.getQueuePosition.get(row.birth_at) as { pos: number };
    queue_position = posRow?.pos ?? 1;
  }

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
    queue_position,
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
