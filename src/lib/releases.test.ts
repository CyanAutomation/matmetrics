import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertReleaseVersionConsistency,
  getRecentReleasesFromSource,
  parseChangelog,
} from '@/lib/releases';

const CHANGELOG_FIXTURE = `# Changelog

All notable changes to MatMetrics are documented in this file.

## [1.2.0] - 2026-03-30

### Features
- Version history modal for displaying recent changelog entries
- Enhanced session filtering and search capabilities

### Fixes
- Fixed modal dialog responsiveness on mobile devices

## [1.1.0] - 2026-01-15

### Improvements
- Optimized session loading performance

### Fixes
- Fixed session date picker behavior

## [1.0.1] - 2025-11-03

### Documentation
- Updated setup instructions

## [1.0.0] - 2025-10-01

### Features
- Initial release
`;

test('parseChangelog parses releases in descending order', () => {
  const releases = parseChangelog(CHANGELOG_FIXTURE);

  assert.equal(releases.length, 4);
  assert.deepEqual(releases[0], {
    version: '1.2.0',
    date: '2026-03-30',
    sections: [
      {
        label: 'Features',
        items: [
          'Version history modal for displaying recent changelog entries',
          'Enhanced session filtering and search capabilities',
        ],
      },
      {
        label: 'Fixes',
        items: ['Fixed modal dialog responsiveness on mobile devices'],
      },
    ],
  });
});

test('getRecentReleasesFromSource returns the latest three releases', () => {
  const releases = getRecentReleasesFromSource(CHANGELOG_FIXTURE);

  assert.deepEqual(
    releases.map((release) => release.version),
    ['1.2.0', '1.1.0', '1.0.1']
  );
});

test('parseChangelog rejects unsupported section labels', () => {
  assert.throws(
    () =>
      parseChangelog(`## [1.2.0] - 2026-03-30

### Breaking Changes
- Removed legacy route
`),
    /unsupported section/
  );
});

test('parseChangelog rejects invalid release dates', () => {
  assert.throws(
    () =>
      parseChangelog(`## [1.2.0] - 2026-02-30

### Fixes
- Fixed date handling
`),
    /valid calendar date/
  );
});

test('assertReleaseVersionConsistency rejects mismatched versions', () => {
  const releases = parseChangelog(CHANGELOG_FIXTURE);

  assert.throws(
    () => assertReleaseVersionConsistency(releases, '1.2.1'),
    /does not match app version/
  );
});
