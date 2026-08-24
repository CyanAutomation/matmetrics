import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTechniques } from './techniques';

test('validateTechniques accepts an empty array for non-technical sessions', () => {
  assert.deepEqual(validateTechniques([]), { ok: true, value: [] });
});
