import { InvalidAiResponseError } from './ai-api-error';
import type { SessionCategory } from './types';

const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const JEV_MODEL = '~typesafe/jev-latest';

type JevAnswer = {
  type?: string;
  choice?: unknown;
  confidence?: unknown;
  noul?: unknown;
  score?: unknown;
};

type JevRequest = {
  model: string;
  state: {
    session: { description: string; notes?: string; category?: string };
  };
  questions: Record<string, unknown>;
};

type JevResponse = { answers?: Record<string, JevAnswer> };

export type JevDecisionClient = (request: JevRequest) => Promise<JevResponse>;

export type SessionAssessmentInput = {
  description: string;
  notes?: string;
  category?: SessionCategory;
};

export type SessionAssessment = {
  suggestedCategory: SessionCategory;
  categoryConfidence: number;
  hasTechniqueDetail: number;
  hasReflection: number;
  fatigueSignal: number;
  injurySignal: number;
};

class JevHttpError extends Error {
  constructor(readonly status: number) {
    super(`Jev request failed with status ${status}`);
  }
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
  key: string
): JevAnswer {
  const result = answers?.[key];
  if (!result) throw new InvalidAiResponseError();
  return result;
}

async function callOpenRouterJev(request: JevRequest): Promise<JevResponse> {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token)
    throw new Error('OPENROUTER_API_KEY environment variable is not set');

  const response = await fetch(OPENROUTER_DECISIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new JevHttpError(response.status);
  return response.json() as Promise<JevResponse>;
}

const questions = {
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
};

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
        category: input.category,
      },
    },
    questions,
  });
  const categoryAnswer = answer(response.answers, 'suggested_category');
  return {
    suggestedCategory: category(categoryAnswer.choice),
    categoryConfidence: numberInRange(categoryAnswer.confidence, 0, 1),
    hasTechniqueDetail: numberInRange(
      answer(response.answers, 'has_technique_detail').noul,
      0,
      1
    ),
    hasReflection: numberInRange(
      answer(response.answers, 'has_reflection').noul,
      0,
      1
    ),
    fatigueSignal: numberInRange(
      answer(response.answers, 'fatigue_signal').score,
      0,
      2
    ),
    injurySignal: numberInRange(
      answer(response.answers, 'injury_signal').noul,
      0,
      1
    ),
  };
}
