import type { JudoSession } from './types';

/** Frontend-only revision metadata returned by MatMetrics' Keiko facade. */
export type SessionSnapshot = JudoSession & {
  /** Keiko's revision number as observed in the session list or mutation response. */
  keikoRevision?: number;
};

/**
 * Keiko accepts a quoted revision number for compatibility with list records.
 * Keep this translation at the HTTP boundary; revisionSha remains GitHub-only.
 */
export function keikoIfMatch(revision: number | undefined): string | undefined {
  if (revision === undefined || !Number.isSafeInteger(revision) || revision < 1) {
    return undefined;
  }
  return `"${revision}"`;
}

export function isKeikoRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 1;
}
