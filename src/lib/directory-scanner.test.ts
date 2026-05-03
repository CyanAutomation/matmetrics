import assert from 'node:assert/strict';
import test from 'node:test';
import { isYearDirName, isMonthDirName } from './directory-scanner';

test('directory-scanner module', async (t) => {
  await t.test('isYearDirName', async (t) => {
    await t.test('returns true for valid year directories', () => {
      assert.strictEqual(isYearDirName('2024'), true);
      assert.strictEqual(isYearDirName('2025'), true);
      assert.strictEqual(isYearDirName('2000'), true);
      assert.strictEqual(isYearDirName('1999'), true);
    });

    await t.test('returns false for invalid year directories', () => {
      assert.strictEqual(isYearDirName('202'), false);
      assert.strictEqual(isYearDirName('20240'), false);
      assert.strictEqual(isYearDirName('abcd'), false);
      assert.strictEqual(isYearDirName('.index'), false);
      assert.strictEqual(isYearDirName('202a'), false);
    });

    await t.test('returns false for empty string', () => {
      assert.strictEqual(isYearDirName(''), false);
    });
  });

  await t.test('isMonthDirName', async (t) => {
    await t.test('returns true for valid month directories', () => {
      assert.strictEqual(isMonthDirName('01'), true);
      assert.strictEqual(isMonthDirName('06'), true);
      assert.strictEqual(isMonthDirName('12'), true);
      assert.strictEqual(isMonthDirName('09'), true);
    });

    await t.test('returns false for invalid month directories', () => {
      assert.strictEqual(isMonthDirName('00'), false);
      assert.strictEqual(isMonthDirName('13'), false);
      assert.strictEqual(isMonthDirName('1'), false);
      assert.strictEqual(isMonthDirName('ab'), false);
      assert.strictEqual(isMonthDirName('012'), false);
      assert.strictEqual(isMonthDirName('1a'), false);
    });

    await t.test('returns false for empty string', () => {
      assert.strictEqual(isMonthDirName(''), false);
    });
  });
});
