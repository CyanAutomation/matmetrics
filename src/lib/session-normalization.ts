import { validateSessionPayload } from './session-validation';
import type { JudoSession } from './types';

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

    const result = validateSessionPayload(payload, {
      generateIdWhenMissing: false,
    });
    return result.ok ? [result.session] : [];
  });
}
