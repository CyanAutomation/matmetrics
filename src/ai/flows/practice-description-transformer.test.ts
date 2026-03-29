import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runTransformPracticeDescription,
  type TransformPracticeInput,
} from './practice-description-transformer';
import { DEFAULT_TRANSFORMER_PROMPT } from '@/lib/ai-prompts';

test('fallback prompt uses shared default constant with mixed-discipline preservation guidance', async () => {
  let receivedPromptInput: TransformPracticeInput | undefined;

  const promptRunner = async (input: TransformPracticeInput) => {
    receivedPromptInput = input;
    return {
      output: {
        transformedDescription: 'Structured session entry',
      },
    };
  };

  const rawDescription =
    'Hit de la Riva entries into berimbolo, then switched to uchi-mata reps and kimura traps.';
  const result = await runTransformPracticeDescription(
    { description: rawDescription },
    promptRunner
  );

  assert.deepEqual(result, {
    transformedDescription: 'Structured session entry',
  });
  assert.equal(receivedPromptInput?.description, rawDescription);
  assert.equal(receivedPromptInput?.customPrompt, DEFAULT_TRANSFORMER_PROMPT);
  assert.match(
    DEFAULT_TRANSFORMER_PROMPT,
    /Preserve and correctly format the user's own discipline terms \(Judo, BJJ, or mixed\)/
  );
  assert.match(
    DEFAULT_TRANSFORMER_PROMPT,
    /Do not forcibly translate BJJ terms into Judo terms \(or vice versa\)/
  );
});

test('prompt payload keeps custom prompt override and raw mixed-language input unchanged', async () => {
  let receivedPromptInput: TransformPracticeInput | undefined;

  const promptRunner = async (input: TransformPracticeInput) => {
    receivedPromptInput = input;
    return {
      output: {
        transformedDescription: 'Custom prompt transform',
      },
    };
  };

  const rawDescription =
    'Worked toreando passes to de la Riva counters, then drilled ippon-seoi-nage transitions.';
  const customPrompt =
    'Keep first-person voice and preserve all technique names verbatim.';

  await runTransformPracticeDescription(
    {
      description: rawDescription,
      customPrompt,
    },
    promptRunner
  );

  assert.equal(receivedPromptInput?.description, rawDescription);
  assert.equal(receivedPromptInput?.customPrompt, customPrompt);
});
