import { Router } from 'express';
import { statements } from '../db';

export const usersRouter = Router();

usersRouter.post('/users', (req, res) => {
  const { hex, npub, walletId, name, picture } = req.body || {};
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) {
    return res.status(400).json({ error: 'Invalid hex' });
  }
  if (typeof npub !== 'string' || !npub.startsWith('npub1')) {
    return res.status(400).json({ error: 'Invalid npub' });
  }
  try {
    statements.upsertUser.run({
      hex,
      npub,
      wallet_id: walletId ?? null,
      name: name ?? null,
      picture: picture ?? null,
      now: Math.floor(Date.now() / 1000),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('upsertUser error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});
