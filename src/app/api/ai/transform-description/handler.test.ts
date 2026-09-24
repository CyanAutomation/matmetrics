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
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const systemPrompts: string[] = [];
  const providerOutputs = [
    '**Training Diary Entry**\n\nI drilled *ne-waza*.',
    '# Training Diary Entry\n\nRandori felt controlled.',
  ];

  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  delete process.env.OPENROUTER_API_KEY;
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
      fidelityStatus: 'not_checked',
    });
    assert.deepEqual(customResult, {
      transformedDescription: 'Randori felt controlled.',
      fidelityStatus: 'not_checked',
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
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  }
});

test('checks transformed facts with JEV and reports a review flag without blocking the rewrite', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const seen: Array<{
    sourceDescription: string;
    transformedDescription: string;
  }> = [];
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'We practiced uchi mata and won.' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  try {
    const result = await transformDescriptionWithCloudflare(
      { description: 'We practiced uchi mata.' },
      async (input) => {
        seen.push(input);
        return 0.82;
      }
    );

    assert.deepEqual(result, {
      transformedDescription: 'We practiced uchi mata and won.',
      fidelityStatus: 'flagged',
    });
    assert.deepEqual(seen, [
      {
        sourceDescription: 'We practiced uchi mata.',
        transformedDescription: 'We practiced uchi mata and won.',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = originalToken;
    }
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  }
});

test('continues with the transformed prose if the optional JEV fidelity check fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'We drilled uchi mata.' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  try {
    assert.deepEqual(
      await transformDescriptionWithCloudflare(
        { description: 'We drilled uchi mata.' },
        async () => {
          throw new Error('provider details must not block the rewrite');
        }
      ),
      {
        transformedDescription: 'We drilled uchi mata.',
        fidelityStatus: 'unavailable',
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = originalToken;
    }
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  }
});

test('rejects provider output that is empty after normalization', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  delete process.env.OPENROUTER_API_KEY;
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
    if (originalOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  }
});
