import assert from 'node:assert/strict';
import test from 'node:test';
import type { JudoSession } from '@/lib/types';
import {
  SessionHistoryReviewController,
  type SessionHistoryReviewControllerDependencies,
} from './session-history-review-controller';

const assessment = {
  suggestedCategory: 'Technical' as const,
  categoryConfidence: 0.9,
  categoryFitProbability: 0.9,
  hasUsefulDetail: 0.8,
  hasReflection: 0.7,
  unsupportedTechniqueTags: [],
};

function session(overrides: Partial<JudoSession> = {}): JudoSession {
  return {
    id: 'session-1',
    date: '2026-11-01',
    category: 'Technical',
    effort: 3,
    techniques: ['Uchi-mata'],
    description: 'Practiced entries against a moving partner.',
    ...overrides,
  };
}

function makeController(
  overrides: Partial<SessionHistoryReviewControllerDependencies> = {}
) {
  return new SessionHistoryReviewController({
    getAuthHeaders: async (headers) => headers ?? {},
    fetcher: async () => ({
      ok: true,
      json: async () => ({ assessments: [assessment] }),
    }) as Response,
    ...overrides,
  });
}

test('history review controller publishes progress and successful results', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const controller = makeController({
    fetcher: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return {
        ok: true,
        json: async () => ({ assessments: [assessment] }),
      } as Response;
    },
  });

  const review = controller.handleReviewHistory([session()], true);
  assert.equal(controller.getSnapshot().isReviewingHistory, true);
  assert.deepEqual(controller.getSnapshot().reviewProgress, {
    completed: 0,
    total: 1,
  });
  await review;

  assert.equal(requestUrl, '/api/ai/assess-sessions');
  assert.equal(requestInit?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    sessions: [
      {
        description: 'Practiced entries against a moving partner.',
        category: 'Technical',
        effort: 3,
        techniques: ['Uchi-mata'],
      },
    ],
  });
  assert.equal(controller.getSnapshot().historyReviewEntries[0]?.sessionId, 'session-1');
  assert.equal(controller.getSnapshot().historyReviewEntries[0]?.error, undefined);
  assert.equal(controller.getSnapshot().reviewedSessionIds.has('session-1'), true);
  assert.deepEqual(controller.getSnapshot().reviewProgress, {
    completed: 1,
    total: 1,
  });
  assert.equal(controller.getSnapshot().isReviewingHistory, false);
  controller.destroy();
});

test('history review controller skips requests when unavailable or no descriptions need review', async () => {
  let calls = 0;
  const controller = makeController({
    fetcher: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ assessments: [assessment] }) } as Response;
    },
  });

  await controller.handleReviewHistory([session()], false);
  await controller.handleReviewHistory([session({ description: '   ' })], true);

  assert.equal(calls, 0);
  assert.equal(controller.getSnapshot().isReviewingHistory, false);
  controller.destroy();
});

test('clearing a review removes its result and makes the session eligible again', async () => {
  const controller = makeController();
  await controller.handleReviewHistory([session()], true);

  controller.clearHistoryReview('session-1');

  assert.deepEqual(controller.getSnapshot().historyReviewEntries, []);
  assert.equal(controller.getSnapshot().reviewedSessionIds.has('session-1'), false);
  controller.destroy();
});
