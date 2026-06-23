export const HEX64_RE = /^[0-9a-f]{64}$/i;

export function normalizeHexPubkey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return HEX64_RE.test(trimmed) ? trimmed : null;
}

export function validateCreatorBeingBoundary(input: {
  owner_hex: unknown;
  being_hex_pub: unknown;
}): { ok: true; owner_hex: string; being_hex_pub: string } | { ok: false; error: string } {
  const owner = normalizeHexPubkey(input.owner_hex);
  if (!owner) return { ok: false, error: 'Invalid owner_hex' };

  const being = normalizeHexPubkey(input.being_hex_pub);
  if (!being) return { ok: false, error: 'Invalid being hex keys' };

  if (owner === being) {
    return {
      ok: false,
      error: 'Creator pubkey cannot be the same as the newborn being pubkey. Scan the creator session/WIF for login, and a separate WIF for the being identity.',
    };
  }

  return { ok: true, owner_hex: owner, being_hex_pub: being };
}
