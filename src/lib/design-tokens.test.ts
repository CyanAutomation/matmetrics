import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  CANONICAL_DESIGN_TOKEN_KEYS,
  isKebabCaseDesignTokenKey,
} from '@/lib/design-tokens';

const repoRoot = process.cwd();

const extractSection2TokenKeys = (): string[] => {
  const designDoc = readFileSync(path.join(repoRoot, 'DESIGN.md'), 'utf8');
  const sectionStart = designDoc.indexOf('### Canonical Token Guidance');
  const sectionEnd = designDoc.indexOf('### Token Naming Convention');

  assert.notEqual(sectionStart, -1, 'DESIGN.md token guidance section missing');
  assert.notEqual(sectionEnd, -1, 'DESIGN.md token naming section missing');

  const tokenTableSection = designDoc.slice(sectionStart, sectionEnd);
  const matches = [...tokenTableSection.matchAll(/\|\s*`([^`]+)`\s*\|/g)];

  return matches.map((match) => match[1]);
};

test('canonical design token keys match DESIGN.md section 2 source of truth', () => {
  const sourceOfTruthKeys = extractSection2TokenKeys();

  assert.deepEqual(CANONICAL_DESIGN_TOKEN_KEYS, sourceOfTruthKeys);
});

test('canonical design token keys remain kebab-case and do not introduce underscores', () => {
  const underscoreKeys = CANONICAL_DESIGN_TOKEN_KEYS.filter((token) =>
    token.includes('_')
  );

  assert.deepEqual(underscoreKeys, []);

  const nonKebabCaseKeys = CANONICAL_DESIGN_TOKEN_KEYS.filter(
    (token) => !isKebabCaseDesignTokenKey(token)
  );

  assert.deepEqual(nonKebabCaseKeys, []);
});
