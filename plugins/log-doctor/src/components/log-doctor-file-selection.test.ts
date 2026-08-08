import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterInvalidFiles,
  toggleSelectedPath,
} from './log-doctor-file-selection';

test('Log Doctor file selection filters paths case-insensitively', () => {
  const files = [{ path: 'data/2026/03/a.md' }, { path: 'README.md' }];
  assert.deepEqual(filterInvalidFiles(files, '  DATA/2026 '), [files[0]]);
  assert.deepEqual(filterInvalidFiles(files, ''), files);
});

test('Log Doctor file selection toggles without mutating the input', () => {
  const selected = ['a.md'];
  assert.deepEqual(toggleSelectedPath(selected, 'b.md'), ['a.md', 'b.md']);
  assert.deepEqual(toggleSelectedPath(selected, 'a.md'), []);
  assert.deepEqual(selected, ['a.md']);
});
