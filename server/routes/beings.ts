import { Router } from 'express';
import { statements } from '../db';

export const beingsRouter = Router();

beingsRouter.get('/beings', (req, res) => {
  const owner = String(req.query.owner || '');
  if (!/^[0-9a-f]{64}$/i.test(owner)) {
    return res.status(400).json({ error: 'Invalid owner hex' });
  }
  const being = statements.getBeingByOwner.get(owner) as {
    name: string;
    npub: string;
    domain: string;
    birthed_at: number;
  } | undefined;

  let embryo: {
    id: string;
    name: string;
    domain: string;
    conceived_at: number;
    birth_at: number;
    status: string;
  } | null = null;

  if (!being) {
    const row = statements.getEmbryoByOwner.get(owner) as any;
    // Surface gestating, birthing AND failed — the user needs to see a failed
    // embryo so they can retry instead of being silently stuck.
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
  }

  res.json({ being: being ?? null, embryo });
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
