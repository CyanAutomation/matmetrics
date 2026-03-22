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

test('meetsMinimumVersion - returns true when version meets or exceeds minimum', () => {
  assert.equal(meetsMinimumVersion('1.0.0', '1.0.0'), true);
  assert.equal(meetsMinimumVersion('2.0.0', '1.0.0'), true);
  assert.equal(meetsMinimumVersion('1.1.0', '1.0.0'), true);
});

test('meetsMinimumVersion - returns false when version is below minimum', () => {
  assert.equal(meetsMinimumVersion('0.9.0', '1.0.0'), false);
  assert.equal(meetsMinimumVersion('0.1.0', '0.2.0'), false);
});

test('meetsMinimumVersion - handles real-world version scenarios', () => {
  const currentVersion = '0.1.0';
  assert.equal(meetsMinimumVersion(currentVersion, '0.1.0'), true);
  assert.equal(meetsMinimumVersion(currentVersion, '0.2.0'), false);
  assert.equal(meetsMinimumVersion(currentVersion, '1.0.0'), false);
});
