import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateIsoDate,
  validateSemanticVersion,
  validateSectionLabel,
  validateReleaseVersionOrdering,
  validateReleaseDates,
  validateReleases,
  compareSemanticVersions,
  type ReleaseEntry,
} from './release-validators';

test('release-validators module', async (t) => {
  await t.test('validateIsoDate', async (t) => {
    await t.test('accepts valid dates', () => {
      assert.strictEqual(validateIsoDate('2024-01-01', 'test'), null);
      assert.strictEqual(validateIsoDate('2025-12-31', 'test'), null);
      assert.strictEqual(validateIsoDate('2026-03-18', 'test'), null);
    });

    await t.test('rejects invalid date formats', () => {
      const errors = [
        validateIsoDate('2024-1-1', 'test'),
        validateIsoDate('24-01-01', 'test'),
        validateIsoDate('2024/01/01', 'test'),
        validateIsoDate('01-01-2024', 'test'),
        validateIsoDate('2024-13-01', 'test'),
        validateIsoDate('2024-01-32', 'test'),
      ];

      errors.forEach((error) => {
        assert.notStrictEqual(error, null);
        assert.strictEqual(error?.type, 'invalid-date');
      });
    });
  });

  await t.test('validateSemanticVersion', async (t) => {
    await t.test('accepts valid semantic versions', () => {
      assert.strictEqual(validateSemanticVersion('1.0.0', 'test'), null);
      assert.strictEqual(validateSemanticVersion('2.5.10', 'test'), null);
      assert.strictEqual(validateSemanticVersion('0.0.1', 'test'), null);
    });

    await t.test('rejects invalid version formats', () => {
      const errors = [
        validateSemanticVersion('1.0', 'test'),
        validateSemanticVersion('1.0.0.0', 'test'),
        validateSemanticVersion('v1.0.0', 'test'),
        validateSemanticVersion('1.a.0', 'test'),
      ];

      errors.forEach((error) => {
        assert.notStrictEqual(error, null);
        assert.strictEqual(error?.type, 'invalid-version');
      });
    });
  });

  await t.test('validateSectionLabel', async (t) => {
    await t.test('accepts valid section labels', () => {
      assert.strictEqual(validateSectionLabel('Features', 'test'), null);
      assert.strictEqual(validateSectionLabel('Improvements', 'test'), null);
      assert.strictEqual(validateSectionLabel('Fixes', 'test'), null);
      assert.strictEqual(validateSectionLabel('Documentation', 'test'), null);
    });

    await t.test('rejects invalid section labels', () => {
      const errors = [
        validateSectionLabel('Bug Fixes', 'test'),
        validateSectionLabel('features', 'test'),
        validateSectionLabel('Unknown', 'test'),
      ];

      errors.forEach((error) => {
        assert.notStrictEqual(error, null);
        assert.strictEqual(error?.type, 'invalid-section');
      });
    });
  });

  await t.test('validateReleaseVersionOrdering', async (t) => {
    await t.test('accepts releases in descending version order', () => {
      const releases: ReleaseEntry[] = [
        {
          version: '2.0.0',
          date: '2025-01-01',
          sections: [],
        },
        {
          version: '1.5.0',
          date: '2024-12-01',
          sections: [],
        },
        {
          version: '1.0.0',
          date: '2024-01-01',
          sections: [],
        },
      ];

      assert.deepStrictEqual(validateReleaseVersionOrdering(releases), []);
    });

    await t.test('rejects releases not in descending order', () => {
      const releases: ReleaseEntry[] = [
        {
          version: '1.0.0',
          date: '2024-01-01',
          sections: [],
        },
        {
          version: '2.0.0',
          date: '2025-01-01',
          sections: [],
        },
      ];

      const errors = validateReleaseVersionOrdering(releases);
      assert(errors.length > 0);
      assert.strictEqual(errors[0].type, 'inconsistent');
    });
  });

  await t.test('validateReleaseDates', async (t) => {
    await t.test('accepts valid release dates', () => {
      const releases: ReleaseEntry[] = [
        {
          version: '1.0.0',
          date: '2024-01-01',
          sections: [],
        },
      ];

      assert.deepStrictEqual(validateReleaseDates(releases), []);
    });

    await t.test('rejects invalid dates', () => {
      const releases: ReleaseEntry[] = [
        {
          version: '1.0.0',
          date: '2024-13-01',
          sections: [],
        },
      ];

      const errors = validateReleaseDates(releases);
      assert(errors.length > 0);
      assert.strictEqual(errors[0].type, 'invalid-date');
    });
  });

  await t.test('compareSemanticVersions', async (t) => {
    await t.test('correctly compares versions', () => {
      assert(compareSemanticVersions('2.0.0', '1.0.0') > 0);
      assert(compareSemanticVersions('1.0.0', '2.0.0') < 0);
      assert.strictEqual(compareSemanticVersions('1.0.0', '1.0.0'), 0);
      assert(compareSemanticVersions('1.1.0', '1.0.5') > 0);
    });
  });

  await t.test('validateReleases', async (t) => {
    await t.test('validates complete valid release list', () => {
      const releases: ReleaseEntry[] = [
        {
          version: '2.0.0',
          date: '2025-01-01',
          sections: [
            {
              label: 'Features',
              items: ['New feature'],
            },
          ],
        },
        {
          version: '1.0.0',
          date: '2024-01-01',
          sections: [
            {
              label: 'Fixes',
              items: ['Bug fix'],
            },
          ],
        },
      ];

      const result = validateReleases(releases);
      assert.strictEqual(result.isValid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    await t.test('detects multiple validation errors', () => {
      const releases = [
        {
          version: '1.0.0',
          date: '2024-01-01',
          sections: [
            {
              label: 'Unknown',
              items: [],
            },
          ],
        },
      ] as unknown as ReleaseEntry[];

      const result = validateReleases(releases);
      assert.strictEqual(result.isValid, false);
      assert(result.errors.length > 0);
    });
  });
});
