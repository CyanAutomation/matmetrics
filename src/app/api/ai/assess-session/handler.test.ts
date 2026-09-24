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
    assert.deepEqual(input, {
      description: 'Lots of uchi mata entries.',
      notes: 'Felt good.',
    });
    return {
      suggestedCategory: 'Technical',
      categoryConfidence: 0.9,
      categoryFitProbability: 0.95,
      hasTechniqueDetail: 0.9,
      hasReflection: 0.4,
      fatigueSignal: 0.2,
      injurySignal: 0.1,
    };
  });
  const response = await post(
    request({
      description: 'Lots of uchi mata entries.',
      notes: 'Felt good.',
      category: 'Randori',
    })
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

test('assessment route returns a safe provider HTTP diagnostic without provider text', async () => {
  const providerSecret = 'provider echoed private session text and credentials';
  const providerError = Object.assign(new Error(providerSecret), {
    status: 402,
  });
  const post = createAssessSessionPost(async () => {
    throw providerError;
  });
  const logs: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => logs.push(args);

  try {
    const response = await post(request({ description: 'Practice.' }));
    const responseText = await response.text();

    assert.equal(response.status, 502);
    assert.match(responseText, /AI_PROVIDER_REJECTED/);
    assert.match(responseText, /402/);
    assert.equal(responseText.includes(providerSecret), false);
    assert.equal(JSON.stringify(logs).includes(providerSecret), false);
    assert.match(JSON.stringify(logs), /402/);
    assert.match(JSON.stringify(logs), /AI_PROVIDER_REJECTED/);
  } finally {
    console.error = originalConsoleError;
  }
});
