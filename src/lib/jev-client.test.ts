import assert from 'node:assert/strict';
import test from 'node:test';

import { assessSessionWithJev, type JevDecisionClient } from './jev-client';

test('assessSessionWithJev turns typed Jev answers into a safe assessment', async () => {
  const client: JevDecisionClient = async (request) => {
    assert.equal(request.model, '~typesafe/jev-latest');
    assert.equal(
      request.state.session.description,
      'Worked uchi mata entries.'
    );
    assert.ok('suggested_category' in request.questions);
    return {
      answers: {
        suggested_category: {
          type: 'choice',
          choice: 'Technical',
          confidence: 0.91,
        },
        has_technique_detail: { type: 'noul', noul: 0.96 },
        has_reflection: { type: 'noul', noul: 0.2 },
        fatigue_signal: { type: 'score', score: 0.4, confidence: 0.87 },
        injury_signal: { type: 'noul', noul: 0.1 },
      },
    };
  };

  assert.deepEqual(
    await assessSessionWithJev(
      {
        description: 'Worked uchi mata entries.',
        notes: '',
        category: 'Randori',
      },
      client
    ),
    {
      suggestedCategory: 'Technical',
      categoryConfidence: 0.91,
      hasTechniqueDetail: 0.96,
      hasReflection: 0.2,
      fatigueSignal: 0.4,
      injurySignal: 0.1,
    }
  );
});

test('assessSessionWithJev rejects malformed provider answers', async () => {
  await assert.rejects(
    assessSessionWithJev({ description: 'Practice.' }, async () => ({
      answers: { suggested_category: { type: 'choice' } },
    })),
    /invalid/i
  );
});
