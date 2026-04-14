import { Router } from 'express';
import { spawn } from 'child_process';
import { statements } from '../db';

export const birthRouter = Router();

const BIRTH_SCRIPT = process.env.BIRTH_SCRIPT || '/opt/beings/incubator/birth.sh';
const PARENT_DOMAIN = process.env.BEING_PARENT_DOMAIN || 'lana.is';

// Names must be lowercase letters, digits, hyphens. 3-32 chars, start alpha, end alnum.
const NAME_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
// Hex privkey/pubkey: exactly 64 hex chars
const HEX64_RE = /^[0-9a-f]{64}$/i;

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
  if (!HEX64_RE.test(being_hex_priv || '') || !HEX64_RE.test(being_hex_pub || '')) {
    return res.status(400).json({ error: 'Invalid being hex keys' });
  }
  if (typeof being_nsec !== 'string' || !being_nsec.startsWith('nsec1')) {
    return res.status(400).json({ error: 'Invalid being nsec' });
  }
  if (typeof being_npub !== 'string' || !being_npub.startsWith('npub1')) {
    return res.status(400).json({ error: 'Invalid being npub' });
  }

  // ── Already has a being? ──────────────────────────────
  const existing = statements.getBeingByOwner.get(owner_hex);
  if (existing) {
    return res.status(409).json({ error: 'Owner already has a Being' });
  }
  const nameTaken = statements.getBeingByName.get(name);
  if (nameTaken) {
    return res.status(409).json({ error: 'Name already taken' });
  }

  const domain = `${name}.${PARENT_DOMAIN}`;

  // ── Invoke birth.sh ───────────────────────────────────
  const args = [
    '--name', name,
    '--domain', domain,
    '--nsec', being_nsec,
    '--npub', being_npub,
    '--hex-priv', being_hex_priv,
    '--hex-pub', being_hex_pub,
    '--father', owner_hex,
    '--language', language || 'english',
    '--vision', vision || 'To exist, grow, and contribute to the Lana ecosystem.',
  ];
  if (being_wif) args.push('--lana-wif', being_wif);
  if (being_wallet) args.push('--lana-wallet', being_wallet);

  console.log(`[birth] spawning ${BIRTH_SCRIPT} for ${name} (${domain})`);

  const child = spawn(BIRTH_SCRIPT, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  child.on('close', (code) => {
    const logs = `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
    if (code !== 0) {
      console.error(`[birth] exit ${code}:\n${logs}`);
      return res.status(500).json({ error: `birth.sh failed with exit ${code}`, logs });
    }
    try {
      statements.insertBeing.run({
        owner_hex,
        being_name: name,
        being_npub,
        being_domain: domain,
        language: language || 'english',
        vision: vision || '',
        birthed_at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error('[birth] DB insert failed:', err);
      return res.status(500).json({ error: 'Birth succeeded but DB record failed', logs });
    }
    console.log(`[birth] ✅ ${name} is alive at ${domain}`);
    res.json({ ok: true, domain, logs });
  });

  child.on('error', (err) => {
    console.error('[birth] spawn error:', err);
    res.status(500).json({ error: `Cannot spawn birth.sh: ${err.message}` });
  });
});
