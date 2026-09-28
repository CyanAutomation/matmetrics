import { InvalidAiResponseError } from './ai-api-error';
import {
  JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD,
  shouldFlagTransformedDescription,
} from './jev-policy';
import { EFFORT_LABELS, type EffortLevel, type SessionCategory } from './types';

const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const JEV_MODEL = '~typesafe/jev-latest';
const JEV_REQUEST_TIMEOUT_MS = 15_000;
const MAX_TECHNIQUE_CANDIDATES = 12;

type JevAnswer = {
  type: unknown;
  choice?: unknown;
  confidence?: unknown;
  noul?: unknown;
  score?: unknown;
};

type JevQuestion =
  | {
      type: 'choice';
      instructions: string;
      criteria: Record<string, string>;
    }
  | {
      type: 'noul';
      instructions: string;
      criteria?: { true: string; false: string };
    }
  | {
      type: 'score';
      instructions: string;
      criteria: string[];
    };

type JevRequest = {
  model: string;
  state: {
    session: {
      description: string;
      notes?: string;
      category?: SessionCategory;
      effort?: EffortLevel;
    };
    technique_candidates?: Record<string, string>;
    transformation?: { description: string };
  };
  questions: Record<string, JevQuestion>;
};

type JevResponse = {
  model?: string;
  answers?: Record<string, JevAnswer>;
};

export type JevDecisionClient = (request: JevRequest) => Promise<JevResponse>;

export type SessionAssessmentInput = {
  description: string;
  notes?: string;
  category?: SessionCategory;
  effort?: EffortLevel;
  techniques?: string[];
};

export type SessionAssessment = {
  suggestedCategory: SessionCategory;
  categoryConfidence: number;
  categoryFitProbability: number;
  hasUsefulDetail: number;
  hasReflection: number;
  fatigueSignal: number;
  injurySignal: number;
  effortConflictProbability?: number;
  unsupportedTechniqueTags: string[];
  resolvedModel?: string;
};

class JevHttpError extends Error {
  constructor(readonly status: number) {
    super(`Jev request failed with status ${status}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numberInRange(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new InvalidAiResponseError();
  }
  return value;
}

function category(value: unknown): SessionCategory {
  if (
    value === 'Technical' ||
    value === 'Randori' ||
    value === 'Shiai' ||
    value === 'Cardio' ||
    value === 'S&C'
  ) {
    return value;
  }
  throw new InvalidAiResponseError();
}

function answer(
  answers: Record<string, JevAnswer> | undefined,
  key: string,
  expectedType: JevQuestion['type']
): JevAnswer {
  const result = answers?.[key];
  if (!isRecord(result) || result.type !== expectedType) {
    throw new InvalidAiResponseError();
  }
  return result as JevAnswer;
}

function parseJevResponse(value: unknown): JevResponse {
  if (!isRecord(value)) throw new InvalidAiResponseError();
  const answers = isRecord(value.answers)
    ? (value.answers as Record<string, JevAnswer>)
    : undefined;
  const model =
    typeof value.model === 'string'
      ? normalizeResolvedModel(value.model)
      : undefined;
  return {
    ...(model ? { model } : {}),
    answers,
  };
}

function normalizeResolvedModel(value: string): string | undefined {
  const model = value.trim();
  return /^[a-zA-Z0-9._:/@~-]{1,128}$/.test(model) ? model : undefined;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

async function callOpenRouterJev(request: JevRequest): Promise<JevResponse> {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token) throw new Error('API key is not configured');

  const startedAt = Date.now();
  const operation = getJevOperation(request);
  let outcome: 'success' | 'error' = 'error';
  let resolvedModel: string | undefined;

  try {
    const response = await fetch(OPENROUTER_DECISIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      cache: 'no-store',
      signal: AbortSignal.timeout(JEV_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new JevHttpError(response.status);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isTimeoutError(error)) throw error;
      throw new InvalidAiResponseError();
    }
    const parsed = parseJevResponse(payload);
    resolvedModel = parsed.model;
    outcome = 'success';
    return parsed;
  } catch (error) {
    if (isTimeoutError(error)) throw new JevHttpError(504);
    if (error instanceof TypeError) throw new JevHttpError(503);
    throw error;
  } finally {
    recordJevObservability({
      operation,
      outcome,
      requestedModel: request.model,
      resolvedModel,
      questionCount: Object.keys(request.questions).length,
      durationMs: Math.max(0, Date.now() - startedAt),
    });
  }
}

function getJevOperation(request: JevRequest): string {
  const questionNames = Object.keys(request.questions);
  if (questionNames.includes('unsupported_detail'))
    return 'description_fidelity';
  if (questionNames.some((name) => name.startsWith('candidate_')))
    return 'technique_verification';
  return 'session_checkin';
}

function recordJevObservability(metadata: {
  operation: string;
  outcome: 'success' | 'error';
  requestedModel: string;
  resolvedModel?: string;
  questionCount: number;
  durationMs: number;
}): void {
  if (process.env.MATMETRICS_JEV_OBSERVABILITY !== 'true') return;

  try {
    console.info('JEV request metadata', metadata);
  } catch {
    // Observability must never change the result of an AI request.
  }
}

const assessmentQuestions = {
  suggested_category: {
    type: 'choice',
    instructions:
      'Which existing MatMetrics session category best describes `session.description`? Base this only on the session text; ignore `session.category`.',
    criteria: {
      Technical: 'Technique drills, instruction, or technical practice.',
      Randori: 'Live sparring or free practice.',
      Shiai: 'Competition, tournament, or contest preparation.',
      Cardio: 'Conditioning focused primarily on aerobic fitness.',
      'S&C': 'Strength and conditioning training.',
    },
  },
  category_fit: {
    type: 'noul',
    instructions:
      'Does `session.description` clearly describe a session that fits at least one of the listed MatMetrics categories? Base this only on the session text; ignore `session.category`.',
    criteria: {
      true: 'The description clearly fits a listed category based on the primary training focus.',
      false:
        'The description is too vague, describes another activity, or does not clearly fit any listed category.',
    },
  },
  has_useful_detail: {
    type: 'noul',
    instructions:
      'Considering the chosen category in `session.category`, do `session.description` and `session.notes` contain at least one concrete, category-relevant detail that makes this entry useful to the athlete later? Ignore length, date, duration, and category labels as evidence. A short entry can be useful. For Technical, look for a technique, drill, or technical focus; for Randori, a specific exchange, grip, transition, or learning point; for Shiai, a contest moment, tactic, or result; for Cardio, the activity or a concrete training detail; for S&C, an exercise, movement, or training focus. Do not require a personal reflection.',
  },
  has_reflection: {
    type: 'noul',
    instructions:
      'Do `session.description` and `session.notes` include a personal reflection about what worked, felt difficult, or needs improvement?',
  },
  fatigue_signal: {
    type: 'score',
    instructions:
      'How strongly do `session.description` and `session.notes` indicate fatigue or unusually difficult recovery? This is not a medical diagnosis.',
    criteria: [
      'No fatigue signal.',
      'Some fatigue or difficult recovery mentioned.',
      'Strong fatigue or unable-to-train signal.',
    ],
  },
  injury_signal: {
    type: 'noul',
    instructions:
      'Do `session.description` or `session.notes` mention pain, injury, or a need to stop or modify training? This is not a medical diagnosis.',
  },
} satisfies Record<string, JevQuestion>;

function getAssessmentQuestions(input: SessionAssessmentInput) {
  const questions: Record<string, JevQuestion> = { ...assessmentQuestions };
  if (input.effort !== undefined) {
    questions.effort_conflict = {
      type: 'noul',
      instructions:
        'Do `session.description` or `session.notes` directly contradict the athlete’s selected effort rating of ' +
        EFFORT_LABELS[input.effort] +
        ' (`session.effort`)? Flag only an explicit contradiction, such as text saying the session was easy while the selected rating is Intense. Do not infer effort from exercise type, duration, sparse text, or missing notes. This is a consistency check, not a judgment of the athlete.',
      criteria: {
        true: 'The text explicitly describes effort that conflicts with the selected rating.',
        false:
          'There is no direct contradiction, or the text does not provide enough effort evidence.',
      },
    };
  }

  const candidates = normalizeTechniqueCandidates(input.techniques ?? []);
  for (const [index] of candidates.entries()) {
    const key = `saved_tag_${index}`;
    questions[key] = {
      type: 'noul',
      instructions:
        'Do `session.description` or `session.notes` clearly indicate that the athlete practiced the saved technique tag `technique_candidates.' +
        key +
        '`? A tag may be supported by a clear synonym or description of the movement.',
      criteria: {
        true: 'The session text clearly indicates the athlete practiced this technique.',
        false:
          'The tag is absent, hypothetical, or only describes someone else’s action.',
      },
    };
  }
  return { questions, candidates };
}

export async function assessSessionWithJev(
  input: SessionAssessmentInput,
  client: JevDecisionClient = callOpenRouterJev
): Promise<SessionAssessment> {
  const { questions, candidates } = getAssessmentQuestions(input);
  const techniqueCandidates = Object.fromEntries(
    candidates.map((candidate, index) => [`saved_tag_${index}`, candidate])
  );
  const response = await client({
    model: JEV_MODEL,
    state: {
      session: {
        description: input.description,
        notes: input.notes,
        category: input.category,
        effort: input.effort,
      },
      ...(candidates.length > 0
        ? { technique_candidates: techniqueCandidates }
        : {}),
    },
    questions,
  });
  const categoryAnswer = answer(
    response.answers,
    'suggested_category',
    'choice'
  );
  const model =
    typeof response.model === 'string'
      ? normalizeResolvedModel(response.model)
      : undefined;

  return {
    suggestedCategory: category(categoryAnswer.choice),
    categoryConfidence: numberInRange(categoryAnswer.confidence, 0, 1),
    categoryFitProbability: numberInRange(
      answer(response.answers, 'category_fit', 'noul').noul,
      0,
      1
    ),
    hasUsefulDetail: numberInRange(
      answer(response.answers, 'has_useful_detail', 'noul').noul,
      0,
      1
    ),
    hasReflection: numberInRange(
      answer(response.answers, 'has_reflection', 'noul').noul,
      0,
      1
    ),
    fatigueSignal: numberInRange(
      answer(response.answers, 'fatigue_signal', 'score').score,
      0,
      2
    ),
    injurySignal: numberInRange(
      answer(response.answers, 'injury_signal', 'noul').noul,
      0,
      1
    ),
    ...(input.effort !== undefined
      ? {
          effortConflictProbability: numberInRange(
            answer(response.answers, 'effort_conflict', 'noul').noul,
            0,
            1
          ),
        }
      : {}),
    unsupportedTechniqueTags: candidates.filter((_, index) =>
      shouldFlagUnconfirmedTag(
        numberInRange(
          answer(response.answers, `saved_tag_${index}`, 'noul').noul,
          0,
          1
        )
      )
    ),
    ...(model ? { resolvedModel: model } : {}),
  };
}

function shouldFlagUnconfirmedTag(probability: number): boolean {
  return probability < JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD;
}

export async function verifyDescriptionFidelityWithJev(
  sourceDescription: string,
  transformedDescription: string,
  client: JevDecisionClient = callOpenRouterJev
): Promise<number> {
  if (!sourceDescription.trim() || !transformedDescription.trim()) {
    throw new InvalidAiResponseError();
  }

  const response = await client({
    model: JEV_MODEL,
    state: {
      session: { description: sourceDescription.trim() },
      transformation: { description: transformedDescription.trim() },
    },
    questions: {
      unsupported_detail: {
        type: 'noul',
        instructions:
          'Does `transformation.description` add a factual claim about techniques, drills, effort, outcomes, or personal reflection that is not supported by `session.description`?',
        criteria: {
          true: 'The transformed text adds at least one specific training fact or reflection absent from the source.',
          false:
            'The transformed text only reorganizes or clarifies information already supported by the source.',
        },
      },
    },
  });

  return numberInRange(
    answer(response.answers, 'unsupported_detail', 'noul').noul,
    0,
    1
  );
}

export type TransformFidelityStatus =
  'not_checked' | 'clear' | 'flagged' | 'unavailable';

export function getTransformFidelityStatus(
  unsupportedDetailProbability: number
): TransformFidelityStatus {
  if (
    !Number.isFinite(unsupportedDetailProbability) ||
    unsupportedDetailProbability < 0 ||
    unsupportedDetailProbability > 1
  ) {
    return 'unavailable';
  }
  return shouldFlagTransformedDescription(unsupportedDetailProbability)
    ? 'flagged'
    : 'clear';
}

function normalizeTechniqueCandidates(candidates: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const candidate of candidates) {
    const value = candidate.trim();
    const identity = value.toLocaleLowerCase('en-US');
    if (!value || value.length > 120 || seen.has(identity)) continue;
    seen.add(identity);
    normalized.push(value);
    if (normalized.length === MAX_TECHNIQUE_CANDIDATES) break;
  }

  return normalized;
}

export async function verifyTechniqueCandidatesWithJev(
  description: string,
  candidates: string[],
  client: JevDecisionClient = callOpenRouterJev
): Promise<string[]> {
  const uniqueCandidates = normalizeTechniqueCandidates(candidates);
  if (!description.trim() || uniqueCandidates.length === 0) return [];

  const techniqueCandidates = Object.fromEntries(
    uniqueCandidates.map((candidate, index) => [
      `candidate_${index}`,
      candidate,
    ])
  );
  const questions = Object.fromEntries(
    uniqueCandidates.map((_, index) => {
      const key = `candidate_${index}`;
      return [
        key,
        {
          type: 'noul',
          instructions:
            'Does `session.description` clearly say the athlete practiced `technique_candidates.' +
            key +
            '`?',
          criteria: {
            true: 'The description names or clearly describes this as a practiced technique.',
            false:
              'The technique is absent, hypothetical, or only mentioned as someone else’s action.',
          },
        } satisfies JevQuestion,
      ];
    })
  );

  const response = await client({
    model: JEV_MODEL,
    state: {
      session: { description: description.trim() },
      technique_candidates: techniqueCandidates,
    },
    questions,
  });

  return uniqueCandidates.filter((_, index) => {
    const probability = numberInRange(
      answer(response.answers, `candidate_${index}`, 'noul').noul,
      0,
      1
    );
    return probability >= JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD;
  });
}
