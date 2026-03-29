import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const tagManagerSource = readFileSync(
  path.join(process.cwd(), 'src', 'components', 'tag-manager.tsx'),
  'utf8'
);

test('TagManager keeps explicit loading flags for async operations', () => {
  assert.match(tagManagerSource, /isAnalyzingRename|isApplyingRename/i);
  assert.match(tagManagerSource, /isAnalyzingMerge|isApplyingMerge/i);
  assert.match(tagManagerSource, /isAnalyzingDelete|isApplyingDelete/i);
});

test('TagManager keeps error plus recovery language in one assertion window', () => {
  assert.match(
    tagManagerSource,
    /error[\s\S]{0,180}(retry|try again|refresh)|(retry|try again|refresh)[\s\S]{0,180}error/i
  );
});
