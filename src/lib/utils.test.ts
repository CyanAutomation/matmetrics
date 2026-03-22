import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareDateOnlyDesc,
  formatLocalDateInputValue,
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

test('formatLocalDateInputValue uses local calendar components', () => {
  const value = formatLocalDateInputValue(new Date(2025, 0, 2, 23, 59, 59));

  assert.equal(value, '2025-01-02');
});

test('formatLocalDateInputValue zero-pads single-digit month/day values', () => {
  const value = formatLocalDateInputValue(new Date(2025, 2, 4, 12, 0, 0));

  assert.equal(value, '2025-03-04');
});

test('formatLocalDateInputValue stays stable near midnight local boundaries', () => {
  const justAfterMidnight = formatLocalDateInputValue(
    new Date(2025, 6, 15, 0, 0, 0)
  );
  const justBeforeMidnight = formatLocalDateInputValue(
    new Date(2025, 6, 15, 23, 59, 59)
  );

  assert.equal(justAfterMidnight, '2025-07-15');
  assert.equal(justBeforeMidnight, '2025-07-15');
});

test('formatLocalDateInputValue remains stable across timezone-offset transition days', () => {
  const transitionDays: Date[] = [];
  const year = 2025;

  for (let month = 0; month < 12; month += 1) {
    for (let day = 1; day <= 31; day += 1) {
      const current = new Date(year, month, day, 12, 0, 0);
      if (current.getFullYear() !== year || current.getMonth() !== month) {
        break;
      }

      const previous = new Date(year, month, day - 1, 12, 0, 0);
      if (current.getTimezoneOffset() !== previous.getTimezoneOffset()) {
        transitionDays.push(current);
      }
    }
  }

  for (const transitionDay of transitionDays) {
    const yearPart = transitionDay.getFullYear();
    const monthPart = transitionDay.getMonth();
    const dayPart = transitionDay.getDate();

    for (const dayDelta of [-1, 0, 1]) {
      const testDate = new Date(
        yearPart,
        monthPart,
        dayPart + dayDelta,
        12,
        0,
        0
      );
      const expected = `${testDate.getFullYear()}-${String(
        testDate.getMonth() + 1
      ).padStart(2, '0')}-${String(testDate.getDate()).padStart(2, '0')}`;
      const formatted = formatLocalDateInputValue(testDate);

      assert.equal(formatted, expected);
    }
  }
});

test('parseDateOnly returns an invalid date object for malformed input', () => {
  const parsed = parseDateOnly('not-a-date');

  assert.equal(Number.isNaN(parsed.getTime()), true);
});
