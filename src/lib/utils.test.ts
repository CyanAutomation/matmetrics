import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  const cases = [
    { date: new Date(2025, 0, 2, 23, 59, 59), expected: '2025-01-02' },
    { date: new Date(2025, 10, 12, 12, 0, 0), expected: '2025-11-12' },
  ];

  cases.forEach(({ date, expected }) => {
    assert.equal(formatLocalDateInputValue(date), expected);
  });
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

type DateFixture = {
  components: [number, number, number];
  expected: string;
  expectedOffset: number;
};

function formatFixturesInTimezone(fixtures: DateFixture[], timezone: string) {
  const script = `
    import utils from ${JSON.stringify(
      new URL('./utils.ts', import.meta.url).href
    )};

    const { formatLocalDateInputValue } = utils;
    const fixtures = ${JSON.stringify(fixtures)};
    const results = fixtures.map(({ components }) => {
      const date = new Date(...components, 12, 0, 0);
      return {
        formatted: formatLocalDateInputValue(date),
        offset: date.getTimezoneOffset(),
      };
    });
    process.stdout.write(JSON.stringify(results));
  `;
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      encoding: 'utf8',
      env: { ...process.env, TZ: timezone },
    }
  );

  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout) as Array<{
    formatted: string;
    offset: number;
  }>;
}

test('formatLocalDateInputValue uses deterministic New York transition fixtures', () => {
  const fixtures: DateFixture[] = [
    // Immediately before, on, and after the 2025 spring-forward date.
    { components: [2025, 2, 8], expected: '2025-03-08', expectedOffset: 300 },
    { components: [2025, 2, 9], expected: '2025-03-09', expectedOffset: 240 },
    { components: [2025, 2, 10], expected: '2025-03-10', expectedOffset: 240 },
    // Immediately before, on, and after the 2025 fall-back date.
    { components: [2025, 10, 1], expected: '2025-11-01', expectedOffset: 240 },
    { components: [2025, 10, 2], expected: '2025-11-02', expectedOffset: 300 },
    { components: [2025, 10, 3], expected: '2025-11-03', expectedOffset: 300 },
  ];
  const results = formatFixturesInTimezone(fixtures, 'America/New_York');

  assert.ok(fixtures.length > 0, 'transition fixtures must not be empty');
  assert.equal(results.length, fixtures.length, 'every fixture was exercised');
  fixtures.forEach((fixture, index) => {
    assert.equal(results[index].formatted, fixture.expected);
    assert.equal(results[index].offset, fixture.expectedOffset);
  });
});

test('formatLocalDateInputValue preserves the local calendar date in UTC', () => {
  const fixtures: DateFixture[] = [
    { components: [2025, 0, 2], expected: '2025-01-02', expectedOffset: 0 },
  ];
  const results = formatFixturesInTimezone(fixtures, 'UTC');

  assert.equal(
    results.length,
    fixtures.length,
    'every UTC fixture was exercised'
  );
  assert.equal(results[0].formatted, fixtures[0].expected);
  assert.equal(results[0].offset, fixtures[0].expectedOffset);
});

test('parseDateOnly returns an invalid date object for malformed input', () => {
  const parsed = parseDateOnly('not-a-date');

  assert.equal(Number.isNaN(parsed.getTime()), true);
});
