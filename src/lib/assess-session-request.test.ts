import assert from 'node:assert/strict';
import test from 'node:test';

import { AI_DESCRIPTION_MAX_BYTES } from './ai-request-limits';
import { parseAssessSessionInput } from './assess-session-request';

test('assessment input trims text, validates context, and caps technique tags', () => {
  const result = parseAssessSessionInput({
    description: '  Worked on grip fighting.  ',
    notes: '  Useful note.  ',
    category: 'Randori',
    effort: 4,
    techniques: Array.from({ length: 15 }, (_, index) => ` Tag ${index} `),
    includeTrainingThemes: true,
  });

  assert.deepEqual(result, {
    ok: true,
    input: {
      description: 'Worked on grip fighting.',
      notes: 'Useful note.',
      category: 'Randori',
      effort: 4,
      techniques: Array.from({ length: 12 }, (_, index) => `Tag ${index}`),
      includeTrainingThemes: true,
    },
  });
});

test('assessment input omits optional values that are not provided', () => {
  assert.deepEqual(parseAssessSessionInput({ description: ' Practice. ' }), {
    ok: true,
    input: { description: 'Practice.', notes: undefined },
  });
});

test('assessment input rejects invalid fields before calling the provider', () => {
  const invalidBodies = [
    { description: '  ' },
    { description: 'Practice.', category: 'Other' },
    { description: 'Practice.', effort: 6 },
    { description: 'Practice.', effort: 3.5 },
    { description: 'Practice.', includeTrainingThemes: 'true' },
    { description: 'Practice.', techniques: Array(101).fill('tag') },
    { description: 'Practice.', techniques: ['  '] },
    { description: 'Practice.', techniques: ['x'.repeat(121)] },
  ];

  for (const body of invalidBodies) {
    assert.deepEqual(parseAssessSessionInput(body), {
      ok: false,
      code: 'INVALID_REQUEST',
      status: 400,
    });
  }
});

test('assessment input preserves description and notes size response codes', () => {
  const description = 'é'.repeat(
    Math.floor(AI_DESCRIPTION_MAX_BYTES / 2) + 1
  );
  const notes = 'n'.repeat(AI_DESCRIPTION_MAX_BYTES + 1);

  assert.deepEqual(parseAssessSessionInput({ description }), {
    ok: false,
    code: 'INVALID_REQUEST',
    status: 400,
  });
  assert.deepEqual(parseAssessSessionInput({ description: 'Practice.', notes }), {
    ok: false,
    code: 'INPUT_TOO_LARGE',
    status: 413,
  });
});
