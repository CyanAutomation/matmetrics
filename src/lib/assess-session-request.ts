import {
  AI_DESCRIPTION_MAX_BYTES,
  exceedsUtf8Limit,
} from './ai-request-limits';
import { SESSION_CATEGORIES, type EffortLevel, type SessionCategory } from './types';
import type { SessionAssessmentInput } from './jev-client';

export type AssessSessionInputResult =
  | { ok: true; input: SessionAssessmentInput }
  | {
      ok: false;
      code: 'INVALID_REQUEST' | 'INPUT_TOO_LARGE';
      status: 400 | 413;
    };

const INVALID_REQUEST: AssessSessionInputResult = {
  ok: false,
  code: 'INVALID_REQUEST',
  status: 400,
};

const INPUT_TOO_LARGE: AssessSessionInputResult = {
  ok: false,
  code: 'INPUT_TOO_LARGE',
  status: 413,
};

function isSessionCategory(value: unknown): value is SessionCategory {
  return (
    typeof value === 'string' &&
    SESSION_CATEGORIES.includes(value as SessionCategory)
  );
}

function isEffortLevel(value: unknown): value is EffortLevel {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function isTechniqueList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (technique) =>
        typeof technique === 'string' &&
        technique.trim().length > 0 &&
        technique.trim().length <= 120
    )
  );
}

export function parseAssessSessionInput(
  body: Record<string, unknown>
): AssessSessionInputResult {
  const description = body.description;
  if (typeof description !== 'string' || !description.trim()) {
    return INVALID_REQUEST;
  }
  if (exceedsUtf8Limit(description, AI_DESCRIPTION_MAX_BYTES)) {
    return INVALID_REQUEST;
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;
  if (notes && exceedsUtf8Limit(notes, AI_DESCRIPTION_MAX_BYTES)) {
    return INPUT_TOO_LARGE;
  }
  if (
    body.includeTrainingThemes !== undefined &&
    typeof body.includeTrainingThemes !== 'boolean'
  ) {
    return INVALID_REQUEST;
  }
  if (
    body.category !== undefined &&
    !isSessionCategory(body.category)
  ) {
    return INVALID_REQUEST;
  }
  if (body.effort !== undefined && !isEffortLevel(body.effort)) {
    return INVALID_REQUEST;
  }
  if (body.techniques !== undefined && !isTechniqueList(body.techniques)) {
    return INVALID_REQUEST;
  }

  return {
    ok: true,
    input: {
      description: description.trim(),
      notes,
      ...(body.category === undefined ? {} : { category: body.category }),
      ...(body.effort === undefined ? {} : { effort: body.effort }),
      ...(body.techniques === undefined
        ? {}
        : {
            techniques: body.techniques
              .map((technique) => technique.trim())
              .slice(0, 12),
          }),
      ...(body.includeTrainingThemes === true
        ? { includeTrainingThemes: true }
        : {}),
    },
  };
}
