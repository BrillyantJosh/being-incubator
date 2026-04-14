import { Router } from 'express';
import { statements } from '../db';

export const beingsRouter = Router();

beingsRouter.get('/beings', (req, res) => {
  const owner = String(req.query.owner || '');
  if (!/^[0-9a-f]{64}$/i.test(owner)) {
    return res.status(400).json({ error: 'Invalid owner hex' });
  }
  const row = statements.getBeingByOwner.get(owner) as {
    name: string;
    npub: string;
    domain: string;
    birthed_at: number;
  } | undefined;
  res.json({ being: row ?? null });
});
