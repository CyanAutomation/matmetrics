import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertReleaseVersionConsistency,
  getRecentReleasesFromSource,
  parseChangelog,
  validateReleaseVersionConsistency,
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

test('parseChangelog supports release-please and manual headings together', () => {
  const releases =
    parseChangelog(`## [1.2.1](https://github.com/CyanAutomation/matmetrics/compare/v1.2.0...v1.2.1) (2026-08-16)

### Bug Fixes
- Corrected a session sync failure

## [1.2.0] - 2026-03-30

### Features
- Added version history
`);

  assert.deepEqual(releases, [
    {
      version: '1.2.1',
      date: '2026-08-16',
      sections: [
        {
          label: 'Bug Fixes',
          items: ['Corrected a session sync failure'],
        },
      ],
    },
    {
      version: '1.2.0',
      date: '2026-03-30',
      sections: [
        {
          label: 'Features',
          items: ['Added version history'],
        },
      ],
    },
  ]);
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

test('validateReleaseVersionConsistency reports a mismatched package version', () => {
  const releases = parseChangelog(CHANGELOG_FIXTURE);

  assert.deepEqual(
    validateReleaseVersionConsistency({
      applicationVersion: '1.2.0',
      packageVersion: '1.2.1',
      releases,
    }),
    [
      {
        source: 'package.json',
        expectedVersion: '1.2.0',
        actualVersion: '1.2.1',
      },
    ]
  );
});

test('validateReleaseVersionConsistency reports a mismatched application version', () => {
  const releases = parseChangelog(CHANGELOG_FIXTURE);

  assert.deepEqual(
    validateReleaseVersionConsistency({
      applicationVersion: '1.2.1',
      packageVersion: '1.2.0',
      releases,
    }),
    [
      {
        source: 'package.json',
        expectedVersion: '1.2.1',
        actualVersion: '1.2.0',
      },
      {
        source: 'CHANGELOG.md',
        expectedVersion: '1.2.1',
        actualVersion: '1.2.0',
      },
    ]
  );
});

test('validateReleaseVersionConsistency reports a mismatched changelog version', () => {
  const releases = parseChangelog(CHANGELOG_FIXTURE);

  assert.deepEqual(
    validateReleaseVersionConsistency({
      applicationVersion: '1.2.1',
      packageVersion: '1.2.1',
      releases,
    }),
    [
      {
        source: 'CHANGELOG.md',
        expectedVersion: '1.2.1',
        actualVersion: '1.2.0',
      },
    ]
  );
});

test('validateReleaseVersionConsistency resolves the latest release by version', () => {
  const releases = parseChangelog(CHANGELOG_FIXTURE);

  assert.deepEqual(
    validateReleaseVersionConsistency({
      applicationVersion: '1.2.0',
      packageVersion: '1.2.0',
      releases: releases.toReversed(),
    }),
    []
  );
});
