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

export function mergeSemanticAndTextSessions<T extends { id: string }>(
  semanticMatches: SessionHistorySearchMatch[] | null,
  sessionsById: ReadonlyMap<string, T>,
  textMatches: T[]
): T[] {
  if (semanticMatches === null) return textMatches;
  const ranked = semanticMatches.flatMap((match) => {
    const session = sessionsById.get(match.id);
    return session ? [session] : [];
  });
  const rankedIds = new Set(ranked.map(({ id }) => id));
  return [...ranked, ...textMatches.filter(({ id }) => !rankedIds.has(id))];
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
const BM25_K1 = 1.2;
const BM25_B = 0.75;

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
  const documents = datedSessions.map(({ session, index }) => {
    const tokens = tokenize([
        session.date,
        session.category,
        session.effort.toString(),
        ...session.techniques,
        session.description ?? '',
        session.notes ?? '',
      ].join(' '));
    return { session, index, tokens, length: tokens.length };
  });
  const documentFrequency = new Map<string, number>();
  for (const token of queryTokens) {
    documentFrequency.set(
      token,
      documents.filter(({ tokens }) => tokens.includes(token)).length
    );
  }
  const averageLength = documents.length
    ? documents.reduce((sum, document) => sum + document.length, 0) /
      documents.length
    : 0;
  const scored = documents
    .map((document) => {
      const frequencies = new Map<string, number>();
      for (const token of document.tokens) {
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
      }
      const score = queryTokens.reduce((total, token) => {
        const frequency = frequencies.get(token) ?? 0;
        const frequencyInCorpus = documentFrequency.get(token) ?? 0;
        if (frequency === 0 || frequencyInCorpus === 0) return total;
        const inverseDocumentFrequency = Math.log(
          1 + (documents.length - frequencyInCorpus + 0.5) /
            (frequencyInCorpus + 0.5)
        );
        const lengthNormalization = averageLength > 0
          ? BM25_K1 * (1 - BM25_B + BM25_B * document.length / averageLength)
          : BM25_K1;
        return total +
          inverseDocumentFrequency *
          (frequency * (BM25_K1 + 1)) /
          (frequency + lengthNormalization);
      }, 0);
      return { session: document.session, index: document.index, score };
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
