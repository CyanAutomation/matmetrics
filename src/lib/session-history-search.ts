import {
  SESSION_CATEGORIES,
  type EffortLevel,
  type JudoSession,
  type SessionCategory,
} from './types';

export const SESSION_HISTORY_SEARCH_CANDIDATE_LIMIT = 8;
export const SESSION_HISTORY_SEARCH_LEXICAL_CANDIDATE_LIMIT = 4;
export const SESSION_HISTORY_SEARCH_RESULT_LIMIT = 5;
export const SESSION_HISTORY_SEARCH_RELEVANCE_THRESHOLD = 0.6;
export const SESSION_HISTORY_SEARCH_QUERY_MAX_BYTES = 500;
export const SESSION_HISTORY_SEARCH_DESCRIPTION_MAX_BYTES = 250;
export const SESSION_HISTORY_SEARCH_NOTES_MAX_BYTES = 250;
export const SESSION_HISTORY_SEARCH_TECHNIQUE_LIMIT = 3;
export const SESSION_HISTORY_SEARCH_TECHNIQUE_MAX_BYTES = 60;
export const SESSION_HISTORY_SEARCH_ID_MAX_LENGTH = 128;

export interface SessionHistorySearchCandidate {
  id: string;
  date: string;
  category: SessionCategory;
  effort: EffortLevel;
  techniques: string[];
  description: string;
  notes: string;
}

export interface SessionHistorySearchMatch {
  id: string;
  relevance: number;
}

const QUERY_STOP_WORDS = new Set([
  'about',
  'after',
  'against',
  'and',
  'any',
  'are',
  'did',
  'for',
  'from',
  'have',
  'how',
  'into',
  'that',
  'the',
  'their',
  'them',
  'there',
  'this',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'with',
  'would',
]);

function truncateUtf8(value: string | undefined, maxBytes: number): string {
  const cleaned = (value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  const encoder = new TextEncoder();
  let result = '';
  let bytes = 0;
  for (const character of cleaned) {
    const characterBytes = encoder.encode(character).byteLength;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result.trim();
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      (value.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
        .filter((token) => !QUERY_STOP_WORDS.has(token))
    )
  );
}

function toCandidate(session: JudoSession): SessionHistorySearchCandidate {
  return {
    id: session.id,
    date: session.date,
    category: session.category,
    effort: session.effort,
    techniques: session.techniques
      .slice(0, SESSION_HISTORY_SEARCH_TECHNIQUE_LIMIT)
      .map((technique) =>
        truncateUtf8(technique, SESSION_HISTORY_SEARCH_TECHNIQUE_MAX_BYTES)
      )
      .filter(Boolean),
    description: truncateUtf8(
      session.description,
      SESSION_HISTORY_SEARCH_DESCRIPTION_MAX_BYTES
    ),
    notes: truncateUtf8(session.notes, SESSION_HISTORY_SEARCH_NOTES_MAX_BYTES),
  };
}

/**
 * Locally selects a small candidate set for explicit semantic search. Strong
 * lexical overlaps are retained, then recent sessions fill the remaining
 * slots so JEV can recognize paraphrases with no shared words.
 */
export function selectSessionHistorySearchCandidates(
  sessions: JudoSession[],
  query: string
): SessionHistorySearchCandidate[] {
  if (!query.trim()) return [];
  const queryTokens = tokenize(query.trim());

  const datedSessions = sessions
    .map((session, index) => ({ session, index }))
    .sort(
      (left, right) =>
        right.session.date.localeCompare(left.session.date) ||
        left.index - right.index
    );
  const scored = datedSessions
    .map(({ session, index }) => {
      const searchableText = [
        session.date,
        session.category,
        session.effort.toString(),
        ...session.techniques,
        session.description ?? '',
        session.notes ?? '',
      ]
        .join(' ')
        .normalize('NFKC')
        .toLocaleLowerCase();
      const score = queryTokens.reduce(
        (total, token) => total + (searchableText.includes(token) ? 1 : 0),
        0
      );
      return { session, index, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.session.date.localeCompare(left.session.date) ||
        left.index - right.index
    );

  const lexicalCandidates = scored
    .filter(({ score }) => score > 0)
    .slice(0, SESSION_HISTORY_SEARCH_LEXICAL_CANDIDATE_LIMIT);
  const selectedIds = new Set(lexicalCandidates.map(({ session }) => session.id));
  const recentCandidates = datedSessions.filter(
    ({ session }) => !selectedIds.has(session.id)
  );
  const remainingCount =
    SESSION_HISTORY_SEARCH_CANDIDATE_LIMIT - lexicalCandidates.length;

  return [...lexicalCandidates, ...recentCandidates.slice(0, remainingCount)]
    .slice(0, SESSION_HISTORY_SEARCH_CANDIDATE_LIMIT)
    .map(({ session }) => toCandidate(session));
}

export function isSessionHistorySearchCandidateCategory(
  value: unknown
): value is SessionCategory {
  return (
    typeof value === 'string' &&
    SESSION_CATEGORIES.includes(value as SessionCategory)
  );
}

export function isSessionHistorySearchEffort(
  value: unknown
): value is EffortLevel {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

export function isSessionHistorySearchMatches(
  value: unknown,
  candidateIds: ReadonlySet<string>
): value is SessionHistorySearchMatch[] {
  if (!Array.isArray(value) || value.length > SESSION_HISTORY_SEARCH_RESULT_LIMIT) {
    return false;
  }
  const resultIds = new Set<string>();
  return value.every((item) => {
    if (
      item === null ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !candidateIds.has(item.id) ||
      resultIds.has(item.id) ||
      typeof item.relevance !== 'number' ||
      !Number.isFinite(item.relevance) ||
      item.relevance < SESSION_HISTORY_SEARCH_RELEVANCE_THRESHOLD ||
      item.relevance > 1
    ) {
      return false;
    }
    resultIds.add(item.id);
    return true;
  });
}
