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
  assert.equal((await transform(request('{"description":'))).status, 400);
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
    400
  );
  assert.equal(calls, 0);
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
