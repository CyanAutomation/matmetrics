import assert from 'node:assert/strict';
import test from 'node:test';

import { InvalidAiResponseError } from '@/lib/ai-api-error';
import { DEFAULT_TRANSFORMER_PROMPT } from '@/lib/ai-prompts';
import {
  TRANSFORM_DESCRIPTION_FORMAT_INSTRUCTION,
  transformDescriptionWithCloudflare,
} from './handler';

test('applies the invariant format to default and custom prompts and normalizes output', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const systemPrompts: string[] = [];
  const providerOutputs = [
    '**Training Diary Entry**\n\nI drilled *ne-waza*.',
    '# Training Diary Entry\n\nRandori felt controlled.',
  ];

  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  globalThis.fetch = async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body));
    systemPrompts.push(requestBody.messages[0].content);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: providerOutputs.shift() } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const defaultResult = await transformDescriptionWithCloudflare({
      description: 'groundwork',
    });
    const customResult = await transformDescriptionWithCloudflare({
      description: 'randori',
      customPrompt: 'Use a concise, matter-of-fact tone.',
    });

    assert.deepEqual(defaultResult, {
      transformedDescription: 'I drilled ne-waza.',
    });
    assert.deepEqual(customResult, {
      transformedDescription: 'Randori felt controlled.',
    });
    assert.equal(systemPrompts[0].startsWith(DEFAULT_TRANSFORMER_PROMPT), true);
    assert.equal(
      systemPrompts[1].startsWith('Use a concise, matter-of-fact tone.'),
      true
    );
    for (const prompt of systemPrompts) {
      assert.equal(
        prompt.endsWith(TRANSFORM_DESCRIPTION_FORMAT_INSTRUCTION),
        true
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = originalToken;
    }
  }
});

test('rejects provider output that is empty after normalization', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '# Generated title' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  try {
    await assert.rejects(
      transformDescriptionWithCloudflare({ description: 'practice' }),
      InvalidAiResponseError
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = originalToken;
    }
  }
});
