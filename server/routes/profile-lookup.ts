import { Router } from 'express';
import { fetchKind0Profile } from '../lib/nostr';

export const profileLookupRouter = Router();

profileLookupRouter.post('/profile-lookup', async (req, res) => {
  const { hex } = req.body || {};
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/i.test(hex)) {
    return res.status(400).json({ error: 'Invalid hex pubkey' });
  }
  try {
    const profile = await fetchKind0Profile(hex);
    res.json(profile);
  } catch (err) {
    console.error('profile-lookup error:', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});
