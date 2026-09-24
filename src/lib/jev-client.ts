import { InvalidAiResponseError } from './ai-api-error';
import { JEV_TECHNIQUE_VERIFY_PROBABILITY_THRESHOLD } from './jev-policy';
import type { SessionCategory } from './types';

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
    session: { description: string; notes?: string };
    technique_candidates?: Record<string, string>;
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
};

export type SessionAssessment = {
  suggestedCategory: SessionCategory;
  categoryConfidence: number;
  hasTechniqueDetail: number;
  hasReflection: number;
  fatigueSignal: number;
  injurySignal: number;
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
  return {
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    answers,
  };
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

async function callOpenRouterJev(request: JevRequest): Promise<JevResponse> {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token)
    throw new Error('OPENROUTER_API_KEY environment variable is not set');

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
    return parseJevResponse(payload);
  } catch (error) {
    if (isTimeoutError(error)) throw new JevHttpError(504);
    if (error instanceof TypeError) throw new JevHttpError(503);
    throw error;
  }
}

const assessmentQuestions = {
  suggested_category: {
    type: 'choice',
    instructions:
      'Which existing MatMetrics session category best describes `session.description`?',
    criteria: {
      Technical: 'Technique drills, instruction, or technical practice.',
      Randori: 'Live sparring or free practice.',
      Shiai: 'Competition, tournament, or contest preparation.',
      Cardio: 'Conditioning focused primarily on aerobic fitness.',
      'S&C': 'Strength and conditioning training.',
    },
  },
  has_technique_detail: {
    type: 'noul',
    instructions:
      'Does `session.description` name a specific technique, drill, or technical focus?',
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

export async function assessSessionWithJev(
  input: SessionAssessmentInput,
  client: JevDecisionClient = callOpenRouterJev
): Promise<SessionAssessment> {
  const response = await client({
    model: JEV_MODEL,
    state: {
      session: {
        description: input.description,
        notes: input.notes,
      },
    },
    questions: assessmentQuestions,
  });
  const categoryAnswer = answer(
    response.answers,
    'suggested_category',
    'choice'
  );
  const model =
    typeof response.model === 'string' && response.model.trim()
      ? response.model.trim()
      : undefined;

  return {
    suggestedCategory: category(categoryAnswer.choice),
    categoryConfidence: numberInRange(categoryAnswer.confidence, 0, 1),
    hasTechniqueDetail: numberInRange(
      answer(response.answers, 'has_technique_detail', 'noul').noul,
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
    ...(model ? { resolvedModel: model } : {}),
  };
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
