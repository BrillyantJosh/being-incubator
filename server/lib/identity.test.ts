import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCreatorBeingBoundary } from './identity';

test('creator and newborn being pubkeys must be different', () => {
  const same = 'a'.repeat(64);
  const result = validateCreatorBeingBoundary({
    owner_hex: same,
    being_hex_pub: same.toUpperCase(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /cannot be the same/i);
});

test('valid creator and newborn pubkeys pass identity boundary', () => {
  const result = validateCreatorBeingBoundary({
    owner_hex: 'a'.repeat(64),
    being_hex_pub: 'b'.repeat(64),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.owner_hex, 'a'.repeat(64));
    assert.equal(result.being_hex_pub, 'b'.repeat(64));
  }
});
