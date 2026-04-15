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
    if (row && (row.status === 'gestating' || row.status === 'birthing')) {
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
