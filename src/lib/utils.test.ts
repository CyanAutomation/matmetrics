import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDateOnlyDesc, isSameMonthAndYear, parseDateOnly } from './utils';

test('parseDateOnly keeps the same calendar day for date-only values', () => {
  const parsed = parseDateOnly('2025-01-10');

  assert.equal(parsed.getFullYear(), 2025);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 10);
});

test('compareDateOnlyDesc sorts newer date strings first without timezone conversion', () => {
  const dates = ['2025-01-10', '2025-01-12', '2024-12-31'];
  dates.sort(compareDateOnlyDesc);

  assert.deepEqual(dates, ['2025-01-12', '2025-01-10', '2024-12-31']);
});

test('isSameMonthAndYear matches on calendar month for date-only session strings', () => {
  const reference = new Date(2025, 0, 31, 23, 59, 59);

  assert.equal(isSameMonthAndYear('2025-01-01', reference), true);
  assert.equal(isSameMonthAndYear('2025-02-01', reference), false);
});
