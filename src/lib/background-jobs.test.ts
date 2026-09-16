import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backgroundJobRequestSchema,
  isBackgroundJobResult,
} from './background-jobs';

test('background job requests accept the two read-only GitHub jobs', () => {
  for (const type of ['log-doctor-scan', 'github-health'] as const) {
    const parsed = backgroundJobRequestSchema.safeParse({
      type,
      config: { owner: 'cyan', repo: 'matmetrics', branch: 'main' },
    });

    assert.equal(parsed.success, true);
  }
});

test('background job requests reject unknown work and malformed repository targets', () => {
  assert.equal(
    backgroundJobRequestSchema.safeParse({
      type: 'github-sync',
      config: { owner: 'cyan', repo: 'matmetrics' },
    }).success,
    false
  );
  assert.equal(
    backgroundJobRequestSchema.safeParse({
      type: 'github-health',
      config: { owner: ' ', repo: 'matmetrics' },
    }).success,
    false
  );
});

test('background job results only accept terminal or runnable statuses', () => {
  assert.equal(
    isBackgroundJobResult({
      id: 'job-1',
      type: 'log-doctor-scan',
      status: 'completed',
      createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:01.000Z',
      attempts: 1,
      result: { success: true },
    }),
    true
  );
  assert.equal(
    isBackgroundJobResult({ id: 'job-1', status: 'mystery' }),
    false
  );
});
