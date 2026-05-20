/**
 * Session ID validation and generation utilities
 */

import crypto from 'crypto';

const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_SESSION_ID_LENGTH = 100;

export function generateSessionId(): string {
  return `session-${Date.now()}-${crypto.randomUUID()}`;
}

export function validateSessionId(
  value: unknown,
  generateWhenMissing: boolean
): { ok: true; value: string } | { ok: false; error: string } {
  // Handle missing ID
  if (value === undefined || value === null) {
    if (!generateWhenMissing) {
      return { ok: false, error: 'Missing required field: id' };
    }
    return { ok: true, value: generateSessionId() };
  }

  // Validate type
  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid id: expected a string' };
  }

  // Validate not empty
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: 'Invalid id: expected a non-empty string' };
  }

  // Validate length
  if (trimmed.length > MAX_SESSION_ID_LENGTH) {
    return {
      ok: false,
      error: `Invalid id: exceeds maximum length of ${MAX_SESSION_ID_LENGTH} characters`,
    };
  }

  // Validate characters
  if (!SAFE_SESSION_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error:
        'Invalid id: contains invalid characters; only letters, digits, "-" and "_" are allowed',
    };
  }

  return { ok: true, value: trimmed };
}
