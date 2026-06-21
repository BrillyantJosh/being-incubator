import { Router } from 'express';
import { statements } from '../db';

export const adminRouter = Router();

const ADMIN_HEX = '56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061';
const HEX64_RE = /^[0-9a-f]{64}$/i;

// Admin still controls the opening silent breath. The actual birth date/time
// is chosen by the creator in the birth flow and stored per embryo.
const BREATH_MIN_MS = 5_000;
const BREATH_MAX_MS = 7 * 86400_000;

function requireAdmin(adminHex: unknown): string | null {
  if (typeof adminHex !== 'string' || !HEX64_RE.test(adminHex)) return 'Missing or invalid admin_hex';
  if (adminHex.toLowerCase() !== ADMIN_HEX) return 'Forbidden';
  return null;
}

// GET /api/admin/settings?admin_hex=...
adminRouter.get('/admin/settings', (req, res) => {
  const err = requireAdmin(req.query.admin_hex);
  if (err) return res.status(err === 'Forbidden' ? 403 : 401).json({ error: err });

  const row = statements.getAdminSettings.get() as
    | { breath_duration_ms: number; updated_at: number | null; updated_by_hex: string | null }
    | undefined;
  if (!row) return res.json({
    breath_duration_ms: 732_000,
    updated_at: null,
    updated_by_hex: null,
  });
  res.json(row);
});

// PUT /api/admin/settings
// Body: { admin_hex, breath_duration_ms }
adminRouter.put('/admin/settings', (req, res) => {
  const body = req.body || {};
  const err = requireAdmin(body.admin_hex);
  if (err) return res.status(err === 'Forbidden' ? 403 : 401).json({ error: err });

  const breath = Number(body.breath_duration_ms);

  if (!Number.isFinite(breath) || breath < BREATH_MIN_MS || breath > BREATH_MAX_MS) {
    return res.status(400).json({
      error: `breath_duration_ms must be between ${BREATH_MIN_MS} and ${BREATH_MAX_MS}`,
    });
  }

  statements.updateAdminSettings.run({
    breath_duration_ms: Math.round(breath),
    updated_at: Date.now(),
    updated_by_hex: ADMIN_HEX,
  });

  const row = statements.getAdminSettings.get();
  res.json(row);
});

// GET /api/admin/queue?admin_hex=...
// Returns full embryo queue ordered by creator-chosen birth_at.
adminRouter.get('/admin/queue', (req, res) => {
  const err = requireAdmin(req.query.admin_hex);
  if (err) return res.status(err === 'Forbidden' ? 403 : 401).json({ error: err });

  const settings = statements.getAdminSettings.get() as
    | { breath_duration_ms: number }
    | undefined;
  const breath = settings?.breath_duration_ms ?? 732_000;

  const rows = statements.listGestatingEmbryos.all() as Array<{
    id: string;
    owner_hex: string;
    name: string;
    domain: string;
    npub: string;
    language: string | null;
    vision: string | null;
    conceived_at: number;
    birth_at: number;
    status: string;
    owner_name: string | null;
    owner_npub: string | null;
    owner_picture: string | null;
  }>;

  const now_s = Math.floor(Date.now() / 1000);
  const embryos = rows.map((r) => {
    const total = Math.max(1, r.birth_at - r.conceived_at);
    const elapsed = Math.max(0, Math.min(total, now_s - r.conceived_at));
    return {
      ...r,
      progress: r.status === 'birthing' ? 1 : elapsed / total,
      time_remaining_s: Math.max(0, r.birth_at - now_s),
    };
  });

  res.json({
    embryos,
    queue_size: embryos.length,
    settings: { breath_duration_ms: breath },
    server_now: now_s,
  });
});
