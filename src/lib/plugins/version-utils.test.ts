import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareVersions,
  meetsMinimumVersion,
} from '@/lib/plugins/version-utils';

test('compareVersions - compares semantic versions correctly', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('2.0.0', '1.9.9') > 0);
  assert.ok(compareVersions('1.0.0', '2.0.0') < 0);
  assert.ok(compareVersions('1.2.4', '1.2.3') > 0);
  assert.ok(compareVersions('1.3.0', '1.2.9') > 0);
});

test('compareVersions - handles missing patch versions', () => {
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('1', '1.0.0'), 0);
});

test('meetsMinimumVersion - plugin version must equal or exceed the minimum version', () => {
  const cases = [
    { current: '1.2.3', minimum: '1.2.3', expected: true },
    { current: '2.0.0', minimum: '1.9.9', expected: true },
    { current: '1.9.9', minimum: '2.0.0', expected: false },
    { current: '1.1.9', minimum: '1.2.0', expected: false },
    { current: '1.2.2', minimum: '1.2.3', expected: false },
    { current: '1.2', minimum: '1.2.0', expected: true },
  ];

  for (const { current, minimum, expected } of cases) {
    assert.equal(
      meetsMinimumVersion(current, minimum),
      expected,
      `${current} >= ${minimum}`
    );
  }
});
