import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('TagManager keeps explicit loading flags for async tag operations', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src', 'components', 'tag-manager.tsx'),
    'utf8'
  );

  assert.match(
    source,
    /\bisAnalyzingRename\b/,
    'Tag Manager should keep a loading signal during rename analysis.'
  );
  assert.match(
    source,
    /\bisApplyingRename\b/,
    'Tag Manager should keep a loading signal during rename apply.'
  );
  assert.match(
    source,
    /\bisAnalyzingMerge\b/,
    'Tag Manager should keep a loading signal during merge analysis.'
  );
  assert.match(
    source,
    /\bisApplyingDelete\b/,
    'Tag Manager should keep a loading signal during delete apply.'
  );
});
