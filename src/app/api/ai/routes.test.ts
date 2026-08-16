import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { createSuggestTechniquesPost } from './suggest-techniques/handler';
import { createTransformDescriptionPost } from './transform-description/handler';
import {
  AI_CUSTOM_PROMPT_MAX_BYTES,
  AI_DESCRIPTION_MAX_BYTES,
  AI_REQUEST_BODY_MAX_BYTES,
} from '@/lib/ai-request-limits';
import {
  aiApiError,
  type AiApiErrorCode,
  InvalidAiResponseError,
} from '@/lib/ai-api-error';

process.env.MATMETRICS_AUTH_TEST_MODE = 'true';

function request(body: string): NextRequest {
  return new NextRequest('http://localhost/api/ai/test', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body,
  });
}

test('AI routes reject malformed JSON without calling their flows', async () => {
  let suggestCalls = 0;
  let transformCalls = 0;
  const suggest = createSuggestTechniquesPost(async () => {
    suggestCalls += 1;
    return [];
  });
  const transform = createTransformDescriptionPost(async () => {
    transformCalls += 1;
    return { transformedDescription: '' };
  });

  assert.equal((await suggest(request('{"description":'))).status, 400);
  const transformResponse = await transform(request('{"description":'));
  assert.equal(transformResponse.status, 400);
  assert.deepEqual(await transformResponse.json(), {
    error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' },
  });
  assert.equal(suggestCalls, 0);
  assert.equal(transformCalls, 0);
});

test('AI routes accept field values exactly at their UTF-8 limits', async () => {
  const description = 'd'.repeat(AI_DESCRIPTION_MAX_BYTES);
  const customPrompt = 'p'.repeat(AI_CUSTOM_PROMPT_MAX_BYTES);
  let suggestedDescription = '';
  let transformedInput: { description: string; customPrompt?: string } | null =
    null;

  const suggest = createSuggestTechniquesPost(async (input) => {
    suggestedDescription = input.description;
    return ['uchi-mata'];
  });
  const transform = createTransformDescriptionPost(async (input) => {
    transformedInput = input;
    return { transformedDescription: input.description };
  });

  assert.equal(
    (await suggest(request(JSON.stringify({ description })))).status,
    200
  );
  assert.equal(
    (await transform(request(JSON.stringify({ description, customPrompt }))))
      .status,
    200
  );
  assert.equal(suggestedDescription, description);
  assert.deepEqual(transformedInput, { description, customPrompt });
});

test('AI routes reject over-limit fields without calling their flows', async () => {
  let calls = 0;
  const suggest = createSuggestTechniquesPost(async () => {
    calls += 1;
    return [];
  });
  const transform = createTransformDescriptionPost(async () => {
    calls += 1;
    return { transformedDescription: '' };
  });
  const overlongDescription = 'é'.repeat(AI_DESCRIPTION_MAX_BYTES / 2 + 1);
  const overlongPrompt = 'p'.repeat(AI_CUSTOM_PROMPT_MAX_BYTES + 1);

  assert.equal(
    (
      await suggest(
        request(JSON.stringify({ description: overlongDescription }))
      )
    ).status,
    400
  );
  assert.equal(
    (
      await transform(
        request(
          JSON.stringify({
            description: 'practice',
            customPrompt: overlongPrompt,
          })
        )
      )
    ).status,
    413
  );
  assert.equal(calls, 0);
});

test('transform route returns stable errors for recognized AI failures', async () => {
  const cases: Array<{
    code: AiApiErrorCode;
    error: unknown;
  }> = [
    { code: 'RATE_LIMITED', error: { status: 'RESOURCE_EXHAUSTED' } },
    { code: 'SERVICE_UNAVAILABLE', error: { status: 'UNAVAILABLE' } },
    { code: 'AUTH_REQUIRED', error: { status: 'UNAUTHENTICATED' } },
    {
      code: 'INPUT_TOO_LARGE',
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Provider context token limit was too large',
      },
    },
    { code: 'INVALID_AI_RESPONSE', error: new InvalidAiResponseError() },
    { code: 'UNKNOWN_ERROR', error: new Error('unrecognized provider fault') },
  ];
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    for (const testCase of cases) {
      const transform = createTransformDescriptionPost(async () => {
        throw testCase.error;
      });
      const response = await transform(
        request(JSON.stringify({ description: 'practice' }))
      );
      const expected = aiApiError(testCase.code);

      assert.equal(response.status, expected.status, testCase.code);
      assert.deepEqual(await response.json(), expected.body, testCase.code);
    }
  } finally {
    console.error = originalConsoleError;
  }
});

test('transform route never leaks internal provider error text', async () => {
  const secret = 'provider-secret-api-key-and-stack-detail';
  const transform = createTransformDescriptionPost(async () => {
    throw new Error(secret);
  });
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const response = await transform(
      request(JSON.stringify({ description: 'practice' }))
    );
    const responseText = await response.text();

    assert.equal(response.status, 500);
    assert.equal(responseText.includes(secret), false);
    assert.deepEqual(
      JSON.parse(responseText),
      aiApiError('UNKNOWN_ERROR').body
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test('AI routes return 413 for oversized request bodies without calling flows', async () => {
  let calls = 0;
  const suggest = createSuggestTechniquesPost(async () => {
    calls += 1;
    return [];
  });
  const transform = createTransformDescriptionPost(async () => {
    calls += 1;
    return { transformedDescription: '' };
  });
  const oversizedBody = JSON.stringify({
    description: 'd'.repeat(AI_REQUEST_BODY_MAX_BYTES),
  });

  assert.equal((await suggest(request(oversizedBody))).status, 413);
  assert.equal((await transform(request(oversizedBody))).status, 413);
  assert.equal(calls, 0);
});
