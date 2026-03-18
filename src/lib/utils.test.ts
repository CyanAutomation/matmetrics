import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareDateOnlyDesc,
  isSameMonthAndYear,
  parseDateOnly,
} from './utils';

test('date-only helpers preserve calendar semantics without timezone drift', () => {
  const parsed = parseDateOnly('2025-01-10');
  const dates = ['2025-01-10', '2025-01-12', '2024-12-31'];
  const reference = new Date(2025, 0, 31, 23, 59, 59);

  assert.equal(parsed.getFullYear(), 2025);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 10);
  dates.sort(compareDateOnlyDesc);
  assert.deepEqual(dates, ['2025-01-12', '2025-01-10', '2024-12-31']);
  assert.equal(isSameMonthAndYear('2025-01-01', reference), true);
  assert.equal(isSameMonthAndYear('2025-02-01', reference), false);
});
