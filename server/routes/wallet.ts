import { Router } from 'express';
import { statements } from '../db';
import { fetchBalance, type ElectrumServer } from '../lib/electrum';

export const walletRouter = Router();

const WALLET_RE = /^L[a-zA-Z0-9]{25,34}$/;
const HEX64_RE = /^[a-f0-9]{64}$/;

const CHECK_URL = 'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/check';
const REGISTER_URL = 'https://laluxmwarlejdwyboudz.supabase.co/functions/v1/register-virgin-wallets';

function loadElectrumServers(): ElectrumServer[] {
  try {
    const row = statements.getKind38888.get() as { electrum_json?: string } | undefined;
    if (row?.electrum_json) {
      const arr = JSON.parse(row.electrum_json) as Array<{ host: string; port: number | string }>;
      return arr.map((e) => ({ host: e.host, port: typeof e.port === 'string' ? parseInt(e.port, 10) : e.port }));
    }
  } catch {}
  return [];
}

walletRouter.get('/wallet/balance/:address', async (req, res) => {
  const address = req.params.address;
  if (!WALLET_RE.test(address)) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }
  try {
    const result = await fetchBalance(address, loadElectrumServers());
    res.json(result);
  } catch (err: any) {
    console.error('[wallet balance]', err.message);
    res.status(502).json({ error: 'Balance lookup failed', detail: err.message });
  }
});

walletRouter.post('/wallet/check-registration', async (req, res) => {
  const { wallet_id } = req.body || {};
  if (!wallet_id || !WALLET_RE.test(wallet_id)) {
    return res.status(400).json({ error: 'Invalid wallet_id' });
  }
  const apiKey = process.env.LANA_REGISTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'LANA_REGISTER_API_KEY not configured' });

  try {
    const r = await fetch(CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'simple_check_wallet_registration',
        api_key: apiKey,
        data: { wallet_id },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Check failed' });
    res.json(data);
  } catch (err: any) {
    console.error('[wallet check-registration]', err.message);
    res.status(502).json({ error: 'Registration check failed' });
  }
});

walletRouter.post('/wallet/register', async (req, res) => {
  const { wallet_id, nostr_id_hex } = req.body || {};
  if (!wallet_id || !WALLET_RE.test(wallet_id)) {
    return res.status(400).json({ error: 'Invalid wallet_id' });
  }
  if (nostr_id_hex && !HEX64_RE.test(nostr_id_hex)) {
    return res.status(400).json({ error: 'Invalid nostr_id_hex' });
  }
  const apiKey = process.env.LANA_REGISTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'LANA_REGISTER_API_KEY not configured' });

  try {
    const body: any = {
      method: 'check_wallet',
      api_key: apiKey,
      data: { wallet_id },
    };
    if (nostr_id_hex) body.data.nostr_id_hex = nostr_id_hex;

    const r = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[wallet register]', r.status, data);
      return res.status(r.status).json({ error: data.message || 'Registration failed' });
    }
    console.log(`[wallet register] ${wallet_id} → ${data.status} ${data.message || ''}`);
    res.json(data);
  } catch (err: any) {
    console.error('[wallet register] error', err.message);
    res.status(502).json({ error: 'Registration request failed' });
  }
});
