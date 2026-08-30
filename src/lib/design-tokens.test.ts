import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_DESIGN_TOKEN_KEYS,
  LEGACY_DESIGN_TOKEN_MAPPINGS,
} from '@/lib/design-tokens';

test('canonical design token keys are unique kebab-case names', () => {
  assert.equal(
    new Set(CANONICAL_DESIGN_TOKEN_KEYS).size,
    CANONICAL_DESIGN_TOKEN_KEYS.length,
    'canonical token keys must be unique'
  );

  for (const token of CANONICAL_DESIGN_TOKEN_KEYS) {
    assert.match(token, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test('legacy design token mappings resolve to canonical keys', () => {
  const canonicalKeys = new Set<string>(CANONICAL_DESIGN_TOKEN_KEYS);

  for (const [legacyKey, canonicalKey] of Object.entries(
    LEGACY_DESIGN_TOKEN_MAPPINGS
  )) {
    assert.match(legacyKey, /^[a-z0-9]+(?:_[a-z0-9]+)+$/);
    assert.ok(
      canonicalKeys.has(canonicalKey),
      `${legacyKey} maps to unknown canonical key ${canonicalKey}`
    );
  }
});
