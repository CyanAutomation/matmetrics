import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { createAssessSessionPost } from './handler';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/assess-session', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('assessment route authenticates, validates, and returns an assessment', async () => {
  const post = createAssessSessionPost(async (input) => {
    assert.equal(input.description, 'Lots of uchi mata entries.');
    return {
      suggestedCategory: 'Technical',
      categoryConfidence: 0.9,
      hasTechniqueDetail: 0.9,
      hasReflection: 0.4,
      fatigueSignal: 0.2,
      injurySignal: 0.1,
    };
  });
  const response = await post(
    request({ description: 'Lots of uchi mata entries.', notes: 'Felt good.' })
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).assessment.suggestedCategory,
    'Technical'
  );
});

test('assessment route rejects missing descriptions without calling the provider', async () => {
  let calls = 0;
  const post = createAssessSessionPost(async () => {
    calls += 1;
    throw new Error('not called');
  });
  assert.equal((await post(request({ notes: 'Nothing here.' }))).status, 400);
  assert.equal(calls, 0);
});
