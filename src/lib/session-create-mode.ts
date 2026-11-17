export const SESSION_CREATE_MODE_HEADER = 'x-matmetrics-session-create-mode';

export type SessionCreateMode =
  | 'legacy'
  | 'keiko-idempotent'
  | 'keiko-unavailable';

export function parseSessionCreateMode(value: string | null): SessionCreateMode | null {
  return value === 'legacy' ||
    value === 'keiko-idempotent' ||
    value === 'keiko-unavailable'
    ? value
    : null;
}

/** Server-only routing decision. A client cannot opt an account into Keiko. */
export function getSessionCreateMode(
  isKeikoCutover: boolean,
  idempotentCreateEnabled: string | undefined
): SessionCreateMode {
  if (!isKeikoCutover) return 'legacy';
  return idempotentCreateEnabled === 'true'
    ? 'keiko-idempotent'
    : 'keiko-unavailable';
}
