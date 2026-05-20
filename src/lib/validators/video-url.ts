/**
 * Video URL validation utilities
 */

import { isBlockedNetworkHostname } from '@/lib/network-safety';

export function validateVideoUrl(
  url: unknown
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  // Allow undefined/null video URLs (optional field)
  if (url === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof url !== 'string') {
    return { ok: false, error: 'Invalid videoUrl: expected a string' };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }

  // Parse and validate URL format
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: 'Invalid videoUrl: expected a valid absolute URL',
    };
  }

  // Validate protocol
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'Invalid videoUrl: protocol must be http or https',
    };
  }

  // Validate hostname (block private/internal addresses)
  if (isBlockedNetworkHostname(parsed.hostname)) {
    return {
      ok: false,
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    };
  }

  return { ok: true, value: parsed.toString() };
}
