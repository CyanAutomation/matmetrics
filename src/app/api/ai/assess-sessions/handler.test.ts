import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { createAssessSessionsPost } from './handler';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/assess-sessions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('batch assessment authenticates and validates all sessions before one assessment call', async () => {
  let calls = 0;
  const post = createAssessSessionsPost(async (inputs) => {
    calls += 1;
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0]?.includeTrainingThemes, true);
    assert.equal(inputs[1]?.description, 'Second session.');
    return inputs.map(() => ({
      suggestedCategory: 'Technical' as const,
      categoryConfidence: 0.9,
      categoryFitProbability: 0.9,
      hasUsefulDetail: 0.9,
      hasReflection: 0.8,
      effortConflictProbability: 0.1,
      unsupportedTechniqueTags: [],
      trainingThemes: {
        kumi_kata: 0.7,
        ne_waza: 0.2,
        transitions: 0.3,
        competition_tactics: 0.1,
      },
    }));
  });
  const response = await post(
    request({ sessions: [{ description: 'First session.' }, { description: 'Second session.' }] })
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).assessments.length, 2);
  assert.equal(calls, 1);
});

test('batch assessment rejects malformed batches without calling JEV', async () => {
  let calls = 0;
  const post = createAssessSessionsPost(async () => {
    calls += 1;
    return [];
  });
  const response = await post(request({ sessions: [{ description: 'Valid.' }, { description: '' }] }));

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
