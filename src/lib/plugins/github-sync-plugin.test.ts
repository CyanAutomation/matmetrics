import assert from 'node:assert/strict';
import test from 'node:test';

import { initPlugin } from '../../../plugins/github-sync/src/index';

test('github-sync initPlugin tolerates missing runtime registration hooks', () => {
  assert.doesNotThrow(() => {
    initPlugin({});
  });
});
