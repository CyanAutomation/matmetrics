import assert from 'node:assert/strict';
import test from 'node:test';

import { waitForGitHubJobResponse } from './github-background-jobs.client';

test('waits for a Keiko job and returns its result payload', async () => {
  const calls: string[] = [];
  const result = await waitForGitHubJobResponse(
    Response.json({
      id: 'job-1', type: 'github-sync-all', status: 'queued',
      createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z', attempts: 0,
    }, { status: 202 }),
    {
      getAuthHeaders: async () => ({}),
      sleep: async () => {},
      fetchImpl: async (input) => {
        calls.push(String(input));
        return Response.json({
          id: 'job-1', type: 'github-sync-all', status: 'completed',
          createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:01.000Z', attempts: 1,
          result: { success: true, message: 'Synced 4 sessions.' },
        });
      },
    }
  );

  assert.deepEqual(result, { success: true, message: 'Synced 4 sessions.' });
  assert.deepEqual(calls, ['/api/background-jobs/job-1']);
});

test('reports terminal background job failures to the caller', async () => {
  await assert.rejects(
    waitForGitHubJobResponse(
      Response.json({
        id: 'job-2', type: 'log-doctor-fix', status: 'queued',
        createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z', attempts: 0,
      }, { status: 202 }),
      {
        getAuthHeaders: async () => ({}),
        sleep: async () => {},
        fetchImpl: async () => Response.json({
          id: 'job-2', type: 'log-doctor-fix', status: 'failed',
          createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:01.000Z', attempts: 5,
          error: 'GitHub App connection was removed',
        }),
      }
    ),
    /GitHub App connection was removed/
  );
});
