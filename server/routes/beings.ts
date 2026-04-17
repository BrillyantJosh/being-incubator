import { Router } from 'express';
import { statements } from '../db';

export const beingsRouter = Router();

const NAME_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED_NAMES = new Set([
  'www', 'api', 'admin', 'mail', 'smtp', 'imap', 'pop', 'pop3',
  'incubator', 'localhost', 'root', 'ns', 'ns1', 'ns2', 'dns',
  'ftp', 'sftp', 'ssh', 'git', 'vpn', 'proxy', 'webmail',
  'relay', 'relays', 'lana', 'lanavault', 'vault', 'wallet',
  'pays', 'paper', 'nostr', 'test', 'staging', 'dev', 'prod',
  'production', 'status', 'monitor', 'grafana', 'prometheus',
]);

// GET /api/beings/check-name?name=foo
// Lightweight pre-flight check used by the /birth Name step so the user
// learns immediately if a name is taken (born being) or reserved (queue,
// system) — not at the very end after they've scanned the WIF.
// Returns { available, reason }. Reasons mirror what /beings/birth would
// return server-side, kept in sync.
beingsRouter.get('/beings/check-name', (req, res) => {
  const raw = String(req.query.name || '').trim().toLowerCase();
  if (!raw) return res.json({ available: false, reason: 'empty' });
  if (!NAME_RE.test(raw)) return res.json({ available: false, reason: 'invalid' });
  if (RESERVED_NAMES.has(raw)) return res.json({ available: false, reason: 'reserved' });

  if (statements.getBeingByName.get(raw)) {
    return res.json({ available: false, reason: 'taken_being' });
  }
  if (statements.getEmbryoByName.get(raw)) {
    return res.json({ available: false, reason: 'taken_embryo' });
  }
  res.json({ available: true });
});

beingsRouter.get('/beings', (req, res) => {
  const owner = String(req.query.owner || '');
  if (!/^[0-9a-f]{64}$/i.test(owner)) {
    return res.status(400).json({ error: 'Invalid owner hex' });
  }

  const isMultiCreator = !!statements.isMultiBeingCreator.get(owner);
  const beings = (statements.getBeingsByOwner.all(owner) as Array<{
    name: string;
    npub: string;
    domain: string;
    language: string;
    birthed_at: number;
  }>);

  // Find active embryo (gestating, birthing, or failed).
  // For multi-being creators there may be multiple embryo rows (birthed ones stay until cleanup),
  // so we specifically look for active/failed status, not just any row.
  let embryo: {
    id: string;
    name: string;
    domain: string;
    conceived_at: number;
    birth_at: number;
    status: string;
  } | null = null;

  // Try active first (gestating/birthing)
  let row = statements.getActiveEmbryoByOwner.get(owner) as any;
  // Fall back to any failed embryo (so user can abandon + retry)
  if (!row) {
    const allEmbryos = statements.getEmbryoByOwner.all(owner) as any[];
    row = allEmbryos.find((e: any) => e.status === 'failed') || null;
  }
  if (row && ['gestating', 'birthing', 'failed'].includes(row.status)) {
    embryo = {
      id: row.id,
      name: row.name,
      domain: row.domain,
      conceived_at: row.conceived_at,
      birth_at: row.birth_at,
      status: row.status,
    };
  }

  // can_create: multi-creator with no active embryo, OR no beings and no embryo
  const hasActiveEmbryo = embryo && ['gestating', 'birthing'].includes(embryo.status);
  const can_create = isMultiCreator
    ? !hasActiveEmbryo
    : beings.length === 0 && !embryo;

  // Backward compat: "being" field = first being (or null)
  res.json({
    being: beings[0] ?? null,
    beings,
    embryo,
    can_create,
  });
});

// POST /api/embryo/:id/abandon — owner discards a failed embryo so they can retry.
// Only works on 'failed' status (never discard a live gestation).
beingsRouter.post('/embryo/:id/abandon', (req, res) => {
  const id = req.params.id;
  const owner = String((req.body || {}).owner_hex || '');
  if (!/^[0-9a-f]{8,64}$/.test(id)) return res.status(400).json({ error: 'Invalid id' });
  if (!/^[0-9a-f]{64}$/i.test(owner)) return res.status(400).json({ error: 'Invalid owner hex' });

  const row = statements.getEmbryoById.get(id) as any;
  if (!row) return res.status(404).json({ error: 'Embryo not found' });
  if (row.owner_hex !== owner) return res.status(403).json({ error: 'Not your embryo' });
  if (row.status !== 'failed') {
    return res.status(409).json({ error: 'Only failed embryos can be abandoned' });
  }
  statements.deleteEmbryo.run(id);
  res.json({ ok: true });
});
