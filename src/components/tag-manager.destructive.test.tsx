import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const tagManagerSource = readFileSync(
  path.join(process.cwd(), 'src', 'components', 'tag-manager.tsx'),
  'utf8'
);

test('TagManager destructive confirmation path is explicit before apply', () => {
  assert.match(
    tagManagerSource,
    /Delete Technique Tag[\s\S]{0,280}Are you sure[\s\S]{0,120}cannot be undone/i
  );

  assert.match(tagManagerSource, /deleteAnalysis/i);
  assert.match(tagManagerSource, /'Apply'/i);
  assert.match(tagManagerSource, /'Analyze'/i);
  assert.match(tagManagerSource, /variant=\"destructive\"/i);
});

test('TagManager cancel path exists and keeps state unchanged safety copy', () => {
  assert.match(
    tagManagerSource,
    /Could not apply this deletion\. Your tags are unchanged\./i
  );

  assert.match(tagManagerSource, /Cancel/i);
  assert.match(tagManagerSource, /(cannot be undone|undone|unchanged)/i);
});
