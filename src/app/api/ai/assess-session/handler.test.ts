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
      category: 'Randori',
      effort: 5,
      techniques: ['Uchi-mata'],
    });
    return {
      suggestedCategory: 'Technical',
      categoryConfidence: 0.9,
      categoryFitProbability: 0.95,
      hasUsefulDetail: 0.9,
      hasReflection: 0.4,
      effortConflictProbability: 0.9,
      unsupportedTechniqueTags: [],
    };
  });
  const response = await post(
    request({
      description: 'Lots of uchi mata entries.',
      notes: 'Felt good.',
      category: 'Randori',
      effort: 5,
      techniques: ['  Uchi-mata  '],
    })
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).assessment.suggestedCategory,
    'Technical'
  );
});

test('assessment route rejects invalid category and effort context before calling JEV', async () => {
  let calls = 0;
  const post = createAssessSessionPost(async () => {
    calls += 1;
    throw new Error('not called');
  });

  assert.equal(
    (await post(request({ description: 'Practice.', category: 'Other' })))
      .status,
    400
  );
  assert.equal(
    (await post(request({ description: 'Practice.', effort: 6 }))).status,
    400
  );
  assert.equal(
    (
      await post(
        request({
          description: 'Practice.',
          techniques: Array.from({ length: 101 }, (_, index) => `Tag ${index}`),
        })
      )
    ).status,
    400
  );
  assert.equal(
    (
      await post(
        request({ description: 'Practice.', techniques: ['Uchi-mata', '  '] })
      )
    ).status,
    400
  );
  assert.equal(
    (
      await post(
        request({ description: 'Practice.', techniques: ['a'.repeat(121)] })
      )
    ).status,
    400
  );
  assert.equal(calls, 0);
});

test('assessment route caps technique-tag audit input at twelve tags', async () => {
  const techniques = Array.from({ length: 15 }, (_, index) => `Tag ${index}`);
  let receivedTechniques: string[] | undefined;
  const post = createAssessSessionPost(async (input) => {
    receivedTechniques = input.techniques;
    return {
      suggestedCategory: 'Technical',
      categoryConfidence: 0.9,
      categoryFitProbability: 0.9,
      hasUsefulDetail: 0.9,
      hasReflection: 0.9,
      unsupportedTechniqueTags: [],
    };
  });

  const response = await post(request({ description: 'Practice.', techniques }));

  assert.equal(response.status, 200);
  assert.deepEqual(receivedTechniques, techniques.slice(0, 12));
});

test('assessment route forwards the explicit training-theme review opt-in', async () => {
  let receivedInput: unknown;
  const post = createAssessSessionPost(async (input) => {
    receivedInput = input;
    return {
      suggestedCategory: 'Technical',
      categoryConfidence: 0.9,
      categoryFitProbability: 0.9,
      hasUsefulDetail: 0.9,
      hasReflection: 0.8,
      unsupportedTechniqueTags: [],
      trainingThemes: {
        kumi_kata: 0.8,
        ne_waza: 0.6,
        transitions: 0.7,
        competition_tactics: 0.2,
      },
    };
  });

  const response = await post(
    request({
      description: 'Worked on grip fighting.',
      includeTrainingThemes: true,
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInput, {
    description: 'Worked on grip fighting.',
    notes: undefined,
    includeTrainingThemes: true,
  });
  assert.equal((await response.json()).assessment.trainingThemes.kumi_kata, 0.8);
});

test('assessment route rejects a malformed training-theme opt-in before calling JEV', async () => {
  let calls = 0;
  const post = createAssessSessionPost(async () => {
    calls += 1;
    throw new Error('not called');
  });

  const response = await post(
    request({ description: 'Practice.', includeTrainingThemes: 'true' })
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
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

test('assessment route returns a retryable message when the OpenRouter key is missing', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalConsoleError = console.error;
  delete process.env.OPENROUTER_API_KEY;
  console.error = () => {};

  try {
    const response = await createAssessSessionPost()(
      request({ description: 'Practice.' })
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'AUTH_REQUIRED',
        message: 'AI features are temporarily unavailable. Please try again later.',
      },
    });
  } finally {
    console.error = originalConsoleError;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('assessment route treats an expired OpenRouter key as unavailable service', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  process.env.OPENROUTER_API_KEY = 'expired-openrouter-key';
  globalThis.fetch = async () =>
    Response.json({ error: { message: 'invalid api key' } }, { status: 401 });
  console.error = () => {};

  try {
    const response = await createAssessSessionPost()(
      request({ description: 'Practice.' })
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'AUTH_REQUIRED',
        message: 'AI features are temporarily unavailable. Please try again later.',
        providerStatus: 401,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
