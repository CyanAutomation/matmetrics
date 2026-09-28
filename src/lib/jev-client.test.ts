import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAiError } from './ai-api-error';
import {
  assessSessionWithJev,
  getTransformFidelityStatus,
  verifyDescriptionFidelityWithJev,
  verifyTechniqueCandidatesWithJev,
  type JevDecisionClient,
} from './jev-client';

test('assessSessionWithJev turns typed Jev answers into a safe assessment', async () => {
  const client: JevDecisionClient = async (request) => {
    assert.equal(request.model, '~typesafe/jev-latest');
    assert.equal(
      request.state.session.description,
      'Worked uchi mata entries.'
    );
    assert.equal(request.state.session.category, 'Technical');
    assert.equal(request.state.session.effort, 4);
    assert.ok('suggested_category' in request.questions);
    assert.equal(request.questions.category_fit?.type, 'noul');
    assert.equal(request.questions.has_useful_detail?.type, 'noul');
    assert.match(
      request.questions.has_useful_detail?.instructions ?? '',
      /ignore length, date, duration, and category labels as evidence/i
    );
    assert.match(
      request.questions.has_useful_detail?.instructions ?? '',
      /a short entry can be useful/i
    );
    assert.equal(request.questions.effort_conflict?.type, 'noul');
    return {
      model: 'typesafe/jev-1.13-20260917',
      answers: {
        suggested_category: {
          type: 'choice',
          choice: 'Technical',
          confidence: 0.91,
        },
        category_fit: { type: 'noul', noul: 0.96 },
        has_useful_detail: { type: 'noul', noul: 0.96 },
        has_reflection: { type: 'noul', noul: 0.2 },
        fatigue_signal: { type: 'score', score: 0.4, confidence: 0.87 },
        injury_signal: { type: 'noul', noul: 0.1 },
        effort_conflict: { type: 'noul', noul: 0.87 },
      },
    };
  };

  assert.deepEqual(
    await assessSessionWithJev(
      {
        description: 'Worked uchi mata entries.',
        notes: '',
        category: 'Technical',
        effort: 4,
      },
      client
    ),
    {
      suggestedCategory: 'Technical',
      categoryConfidence: 0.91,
      categoryFitProbability: 0.96,
      hasUsefulDetail: 0.96,
      hasReflection: 0.2,
      fatigueSignal: 0.4,
      injurySignal: 0.1,
      effortConflictProbability: 0.87,
      unsupportedTechniqueTags: [],
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

test('assessSessionWithJev omits malformed resolved model identifiers', async () => {
  const result = await assessSessionWithJev(
    { description: 'Practice.' },
    async () => ({
      model: 'typesafe/jev-test PRIVATE SESSION CONTENT',
      answers: {
        suggested_category: {
          type: 'choice',
          choice: 'Technical',
          confidence: 0.9,
        },
        category_fit: { type: 'noul', noul: 0.9 },
        has_useful_detail: { type: 'noul', noul: 0.9 },
        has_reflection: { type: 'noul', noul: 0.8 },
        fatigue_signal: { type: 'score', score: 0.2 },
        injury_signal: { type: 'noul', noul: 0.1 },
      },
    })
  );

  assert.equal('resolvedModel' in result, false);
});

test('assessSessionWithJev rejects answers whose primitive type is wrong', async () => {
  await assert.rejects(
    assessSessionWithJev({ description: 'Practice.' }, async () => ({
      answers: {
        suggested_category: {
          type: 'noul',
          choice: 'Technical',
          confidence: 0.9,
        },
        category_fit: { type: 'noul', noul: 0.9 },
        has_useful_detail: { type: 'noul', noul: 0.9 },
        has_reflection: { type: 'noul', noul: 0.4 },
        fatigue_signal: { type: 'score', score: 0.2 },
        injury_signal: { type: 'noul', noul: 0.1 },
      },
    })),
    /invalid/i
  );
});

test('assessment audits saved technique tags in the same request and only flags unconfirmed tags', async () => {
  let seenRequest: Parameters<JevDecisionClient>[0] | undefined;
  const result = await assessSessionWithJev(
    {
      description: 'Practiced uchi mata entries.',
      notes: 'Worked on timing.',
      category: 'Technical',
      effort: 3,
      techniques: ['Uchi-mata', 'O-soto-gari', 'Uchi-mata'],
    },
    async (request) => {
      seenRequest = request;
      return {
        answers: {
          suggested_category: {
            type: 'choice',
            choice: 'Technical',
            confidence: 0.9,
          },
          category_fit: { type: 'noul', noul: 0.9 },
          has_useful_detail: { type: 'noul', noul: 0.9 },
          has_reflection: { type: 'noul', noul: 0.8 },
          fatigue_signal: { type: 'score', score: 0.2 },
          injury_signal: { type: 'noul', noul: 0.1 },
          effort_conflict: { type: 'noul', noul: 0.1 },
          saved_tag_0: { type: 'noul', noul: 0.95 },
          saved_tag_1: { type: 'noul', noul: 0.89 },
        },
      };
    }
  );

  assert.deepEqual(seenRequest?.state.technique_candidates, {
    saved_tag_0: 'Uchi-mata',
    saved_tag_1: 'O-soto-gari',
  });
  assert.equal(seenRequest?.questions.saved_tag_0?.type, 'noul');
  assert.equal(seenRequest?.questions.saved_tag_1?.type, 'noul');
  assert.deepEqual(result.unsupportedTechniqueTags, ['O-soto-gari']);
});

test('verifyDescriptionFidelityWithJev asks about unsupported facts in one request', async () => {
  let seenRequest: Parameters<JevDecisionClient>[0] | undefined;
  const probability = await verifyDescriptionFidelityWithJev(
    'We practiced uchi mata entries.',
    'We practiced uchi mata entries and improved our competition results.',
    async (request) => {
      seenRequest = request;
      return {
        model: 'typesafe/jev-1.13-20260917',
        answers: {
          unsupported_detail: { type: 'noul', noul: 0.82 },
        },
      };
    }
  );

  assert.equal(probability, 0.82);
  assert.equal(seenRequest?.model, '~typesafe/jev-latest');
  assert.deepEqual(seenRequest?.state.session, {
    description: 'We practiced uchi mata entries.',
  });
  assert.deepEqual(seenRequest?.state.transformation, {
    description:
      'We practiced uchi mata entries and improved our competition results.',
  });
  assert.equal(seenRequest?.questions.unsupported_detail?.type, 'noul');
});

test('getTransformFidelityStatus flags the provisional threshold and rejects invalid probabilities', () => {
  assert.equal(getTransformFidelityStatus(0.49), 'clear');
  assert.equal(getTransformFidelityStatus(0.5), 'flagged');
  assert.equal(getTransformFidelityStatus(1), 'flagged');
  assert.equal(getTransformFidelityStatus(Number.NaN), 'unavailable');
  assert.equal(getTransformFidelityStatus(1.1), 'unavailable');
});

test('verifyTechniqueCandidatesWithJev checks candidates in one batched request', async () => {
  let seenRequest: Parameters<JevDecisionClient>[0] | undefined;
  const verified = await verifyTechniqueCandidatesWithJev(
    'We drilled O-soto-gari entries, then worked on balance.',
    [' O-soto-gari ', 'Uchi-mata', 'O-soto-gari', 'Tai-otoshi'],
    async (request) => {
      seenRequest = request;
      return {
        answers: {
          candidate_0: { type: 'noul', noul: 0.96 },
          candidate_1: { type: 'noul', noul: 0.42 },
          candidate_2: { type: 'noul', noul: 0.9 },
        },
      };
    }
  );

  assert.deepEqual(verified, ['O-soto-gari', 'Tai-otoshi']);
  assert.equal(
    seenRequest?.state.session.description,
    'We drilled O-soto-gari entries, then worked on balance.'
  );
  assert.equal(Object.keys(seenRequest?.questions ?? {}).length, 3);
  assert.equal(seenRequest?.questions.candidate_0?.type, 'noul');
  assert.deepEqual(seenRequest?.state.technique_candidates, {
    candidate_0: 'O-soto-gari',
    candidate_1: 'Uchi-mata',
    candidate_2: 'Tai-otoshi',
  });
});

test('verifyTechniqueCandidatesWithJev skips empty candidate lists', async () => {
  let calls = 0;
  assert.deepEqual(
    await verifyTechniqueCandidatesWithJev('Practice.', [' ', ''], async () => {
      calls += 1;
      return {};
    }),
    []
  );
  assert.equal(calls, 0);
});

test('verifyTechniqueCandidatesWithJev caps the batched question count', async () => {
  let questionCount = 0;
  const candidates = Array.from(
    { length: 15 },
    (_, index) => `Technique ${index}`
  );
  const verified = await verifyTechniqueCandidatesWithJev(
    'We practiced several techniques.',
    candidates,
    async (request) => {
      questionCount = Object.keys(request.questions).length;
      return {
        answers: Object.fromEntries(
          Array.from({ length: questionCount }, (_, index) => [
            `candidate_${index}`,
            { type: 'noul', noul: 0.95 },
          ])
        ),
      };
    }
  );

  assert.equal(questionCount, 12);
  assert.deepEqual(verified, candidates.slice(0, 12));
});

test('assessment responses omit resolved model metadata', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  let seenUrl = '';
  let seenInit: RequestInit | undefined;
  process.env.OPENROUTER_API_KEY = 'unit-test-key';
  globalThis.fetch = (async (input, init) => {
    seenUrl = String(input);
    seenInit = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'typesafe/jev-test',
        answers: {
          suggested_category: {
            type: 'choice',
            choice: 'Technical',
            confidence: 0.91,
          },
          category_fit: { type: 'noul', noul: 0.92 },
          has_useful_detail: { type: 'noul', noul: 0.96 },
          has_reflection: { type: 'noul', noul: 0.2 },
          fatigue_signal: { type: 'score', score: 0.4 },
          injury_signal: { type: 'noul', noul: 0.1 },
        },
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const assessment = await assessSessionWithJev({
      description: 'Worked uchi mata entries.',
    });
    assert.equal(seenUrl, 'https://openrouter.ai/api/alpha/decisions');
    assert.equal(seenInit?.method, 'POST');
    assert.ok(seenInit?.signal instanceof AbortSignal);
    assert.equal(
      (seenInit?.headers as Record<string, string>).Authorization,
      'Bearer unit-test-key'
    );
    assert.equal('resolvedModel' in assessment, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('opt-in JEV observability logs model and outcome metadata without session text', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalLogging = process.env.MATMETRICS_JEV_OBSERVABILITY;
  const originalInfo = console.info;
  const logEntries: unknown[][] = [];
  process.env.OPENROUTER_API_KEY = 'unit-test-key';
  process.env.MATMETRICS_JEV_OBSERVABILITY = 'true';
  console.info = (...args: unknown[]) => logEntries.push(args);
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'typesafe/jev-observability-test',
        answers: {
          suggested_category: {
            type: 'choice',
            choice: 'Technical',
            confidence: 0.91,
          },
          category_fit: { type: 'noul', noul: 0.92 },
          has_useful_detail: { type: 'noul', noul: 0.96 },
          has_reflection: { type: 'noul', noul: 0.2 },
          fatigue_signal: { type: 'score', score: 1.4 },
          injury_signal: { type: 'noul', noul: 0.9 },
        },
      }),
    }) as Response) as typeof fetch;

  try {
    await assessSessionWithJev({
      description: 'PRIVATE DESCRIPTION TEXT',
      notes: 'PRIVATE HEALTH NOTES',
    });
    const serialized = JSON.stringify(logEntries);

    assert.match(serialized, /typesafe\/jev-observability-test/);
    assert.match(serialized, /session_checkin/);
    assert.match(serialized, /success/);
    assert.doesNotMatch(serialized, /PRIVATE DESCRIPTION TEXT/);
    assert.doesNotMatch(serialized, /PRIVATE HEALTH NOTES/);
    assert.doesNotMatch(serialized, /1\.4|0\.9/);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalLogging === undefined)
      delete process.env.MATMETRICS_JEV_OBSERVABILITY;
    else process.env.MATMETRICS_JEV_OBSERVABILITY = originalLogging;
  }
});

test('OpenRouter JEV reports a generic error when its API key is missing', async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    await assert.rejects(
      assessSessionWithJev({ description: 'Practice.' }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === 'API key is not configured' &&
        !error.message.includes('OPENROUTER_API_KEY')
    );
  } finally {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('OpenRouter JEV timeouts become safe service-unavailable errors', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'unit-test-key';
  globalThis.fetch = (async () => {
    throw new DOMException('The operation timed out', 'TimeoutError');
  }) as typeof fetch;

  try {
    await assert.rejects(
      assessSessionWithJev({ description: 'Practice.' }),
      (error: unknown) => classifyAiError(error) === 'SERVICE_UNAVAILABLE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('OpenRouter JEV timeouts while reading the response body stay service-unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'unit-test-key';
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => {
        throw new DOMException('The operation timed out', 'TimeoutError');
      },
    }) as unknown as Response) as typeof fetch;

  try {
    await assert.rejects(
      assessSessionWithJev({ description: 'Practice.' }),
      (error: unknown) => classifyAiError(error) === 'SERVICE_UNAVAILABLE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('OpenRouter transport failures become safe service-unavailable errors', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'unit-test-key';
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;

  try {
    await assert.rejects(
      assessSessionWithJev({ description: 'Practice.' }),
      (error: unknown) => classifyAiError(error) === 'SERVICE_UNAVAILABLE'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
