import { exceedsUtf8Limit } from './ai-request-limits';
import {
  isSessionHistorySearchCandidateCategory,
  isSessionHistorySearchEffort,
  SESSION_HISTORY_SEARCH_CANDIDATE_LIMIT,
  SESSION_HISTORY_SEARCH_DESCRIPTION_MAX_BYTES,
  SESSION_HISTORY_SEARCH_ID_MAX_LENGTH,
  SESSION_HISTORY_SEARCH_NOTES_MAX_BYTES,
  SESSION_HISTORY_SEARCH_QUERY_MAX_BYTES,
  SESSION_HISTORY_SEARCH_TECHNIQUE_LIMIT,
  SESSION_HISTORY_SEARCH_TECHNIQUE_MAX_BYTES,
  type SessionHistorySearchCandidate,
} from './session-history-search';

export type SessionHistorySearchRequestResult =
  | {
      ok: true;
      input: { query: string; candidates: SessionHistorySearchCandidate[] };
    }
  | { ok: false; code: 'INVALID_REQUEST' | 'INPUT_TOO_LARGE'; status: 400 | 413 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseCandidate(value: unknown): SessionHistorySearchCandidate | null {
  if (!isRecord(value)) return null;
  const {
    id,
    date,
    category,
    effort,
    techniques,
    description,
    notes,
  } = value;

  if (
    typeof id !== 'string' ||
    !id.trim() ||
    id.trim() !== id ||
    id.length > SESSION_HISTORY_SEARCH_ID_MAX_LENGTH ||
    !isValidDate(date) ||
    !isSessionHistorySearchCandidateCategory(category) ||
    !isSessionHistorySearchEffort(effort) ||
    !Array.isArray(techniques) ||
    techniques.length > SESSION_HISTORY_SEARCH_TECHNIQUE_LIMIT ||
    !techniques.every(
      (technique) =>
        typeof technique === 'string' &&
        technique.trim().length > 0 &&
        !exceedsUtf8Limit(
          technique,
          SESSION_HISTORY_SEARCH_TECHNIQUE_MAX_BYTES
        )
    ) ||
    typeof description !== 'string' ||
    exceedsUtf8Limit(description, SESSION_HISTORY_SEARCH_DESCRIPTION_MAX_BYTES) ||
    typeof notes !== 'string' ||
    exceedsUtf8Limit(notes, SESSION_HISTORY_SEARCH_NOTES_MAX_BYTES)
  ) {
    return null;
  }

  return { id, date, category, effort, techniques, description, notes };
}

export function parseSessionHistorySearchRequest(
  body: Record<string, unknown>
): SessionHistorySearchRequestResult {
  if (typeof body.query !== 'string' || !body.query.trim()) {
    return { ok: false, code: 'INVALID_REQUEST', status: 400 };
  }
  if (exceedsUtf8Limit(body.query, SESSION_HISTORY_SEARCH_QUERY_MAX_BYTES)) {
    return { ok: false, code: 'INPUT_TOO_LARGE', status: 413 };
  }
  if (
    !Array.isArray(body.candidates) ||
    body.candidates.length === 0 ||
    body.candidates.length > SESSION_HISTORY_SEARCH_CANDIDATE_LIMIT
  ) {
    return { ok: false, code: 'INVALID_REQUEST', status: 400 };
  }

  const candidates = body.candidates.map(parseCandidate);
  if (
    candidates.some((candidate) => candidate === null) ||
    new Set(candidates.map((candidate) => candidate?.id)).size !== candidates.length
  ) {
    return { ok: false, code: 'INVALID_REQUEST', status: 400 };
  }

  return {
    ok: true,
    input: {
      query: body.query.trim(),
      candidates: candidates as SessionHistorySearchCandidate[],
    },
  };
}
