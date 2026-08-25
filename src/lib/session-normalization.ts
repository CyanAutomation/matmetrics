import { validateSessionFields } from './session-validation-fields';
import type { JudoSession } from './types';

const MAX_PERSISTED_SESSION_ID_LENGTH = 100;

function normalizePersistedSession(
  payload: Record<string, unknown>
): JudoSession | null {
  if (
    typeof payload.id !== 'string' ||
    payload.id.trim().length === 0 ||
    payload.id.length > MAX_PERSISTED_SESSION_ID_LENGTH
  ) {
    return null;
  }

  const fieldsResult = validateSessionFields(payload);
  if (!fieldsResult.ok) {
    return null;
  }

  return {
    id: payload.id,
    ...fieldsResult.values,
    ...(typeof payload.revisionSha === 'string' && payload.revisionSha
      ? { revisionSha: payload.revisionSha }
      : {}),
  };
}

/**
 * Converts persisted or API-supplied session data into the current contract.
 *
 * Older browser caches may contain sessions created before techniques were
 * required. Treat a missing or null techniques value as an empty list, then
 * reject records that still fail the current session validation rules.
 */
export function normalizeSessionList(value: unknown): JudoSession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return [];
    }

    const payload = {
      ...(candidate as Record<string, unknown>),
    };
    if (payload.techniques == null) {
      payload.techniques = [];
    }

    const session = normalizePersistedSession(payload);
    return session ? [session] : [];
  });
}
