import { JEV_ASSESSMENT_BATCH_MAX, type SessionAssessmentInput } from './jev-client';
import { parseAssessSessionInput } from './assess-session-request';

export type AssessSessionsInputResult =
  | { ok: true; inputs: SessionAssessmentInput[] }
  | { ok: false; code: 'INVALID_REQUEST' | 'INPUT_TOO_LARGE'; status: 400 | 413 };

export function parseAssessSessionsInput(value: unknown): AssessSessionsInputResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'INVALID_REQUEST', status: 400 };
  }
  const sessions = (value as Record<string, unknown>).sessions;
  if (
    !Array.isArray(sessions) ||
    sessions.length === 0 ||
    sessions.length > JEV_ASSESSMENT_BATCH_MAX
  ) {
    return { ok: false, code: 'INVALID_REQUEST', status: 400 };
  }

  const inputs: SessionAssessmentInput[] = [];
  for (const session of sessions) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      return { ok: false, code: 'INVALID_REQUEST', status: 400 };
    }
    const parsed = parseAssessSessionInput({
      ...(session as Record<string, unknown>),
      includeTrainingThemes: true,
    });
    if (!parsed.ok) {
      return { ok: false, code: parsed.code, status: parsed.status };
    }
    inputs.push(parsed.input);
  }
  return { ok: true, inputs };
}
