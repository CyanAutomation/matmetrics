import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLogDoctorScanResult } from './log-doctor-fallback';

test('buildLogDoctorScanResult preserves valid sessions and malformed files in one actionable result', () => {
  const result = buildLogDoctorScanResult({
    sessions: [
      {
        id: 'practice-1',
        date: '2026-09-12',
        effort: 3,
        category: 'Technical',
        techniques: [],
        description: 'Entries',
      },
    ],
    issues: [
      {
        source: 'github',
        code: 'parse_failed',
        filePath: 'data/2026/09/broken.md',
        message: 'Frontmatter is malformed',
      },
    ],
    branch: 'main',
  });

  assert.deepEqual(result.summary, {
    totalFiles: 2,
    validFiles: 1,
    invalidFiles: 1,
  });
  assert.equal(result.success, false);
  assert.equal(result.files[0].status, 'valid');
  assert.deepEqual(result.files[1], {
    path: 'data/2026/09/broken.md',
    status: 'invalid',
    errors: ['Frontmatter is malformed'],
  });
});
