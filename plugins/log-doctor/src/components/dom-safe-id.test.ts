import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createDomSafePathId } from './dom-safe-id';

test('createDomSafePathId returns deterministic, DOM-safe ids for complex paths', () => {
  const first = createDomSafePathId('data/2026/03/%E2%9C%93-matmetrics.md', 0);
  const second = createDomSafePathId('data/2026/03/%E2%9C%93-matmetrics.md', 0);
  const withSlashes = createDomSafePathId('logs/nested/path/file.md', 1);

  assert.equal(first, second);
  assert.match(first, /^select-file-0-[a-z0-9]+$/);
  assert.match(withSlashes, /^select-file-1-[a-z0-9]+$/);
  assert.equal(first.includes('/'), false);
  assert.equal(first.includes('%'), false);
});
