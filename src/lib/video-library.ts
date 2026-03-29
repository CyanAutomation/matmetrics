import type { JudoSession } from '@/lib/types';

export const STARTER_VIDEO_ALLOWED_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
] as const;

export type VideoLibraryEntryStatus =
  | 'missing'
  | 'allowed_unchecked'
  | 'disallowed_domain'
  | 'invalid_url';

export type VideoLinkCheckStatus =
  | 'reachable'
  | 'broken'
  | 'disallowed_domain'
  | 'check_failed';

export interface VideoLibraryEntry {
  session: JudoSession;
  status: VideoLibraryEntryStatus;
  url?: string;
  hostname?: string;
}

export interface VideoLinkCheckResult {
  sessionId: string;
  url: string;
  hostname: string;
  status: VideoLinkCheckStatus;
  checkedAt: string;
  httpStatus?: number;
  error?: string;
}

function isLikelyBlockedClientHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized) {
    return true;
  }

  if (
    normalized === 'localhost' ||
    normalized === 'metadata.google.internal' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.localdomain') ||
    normalized === '::1' ||
    normalized === '0.0.0.0'
  ) {
    return true;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;

    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }

  return false;
}

export function normalizeVideoDomainInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('://')) {
    return null;
  }

  if (
    trimmed.includes('/') ||
    trimmed.includes('?') ||
    trimmed.includes('#') ||
    trimmed.includes(':') ||
    trimmed.startsWith('.')
  ) {
    return null;
  }

  const normalized = trimmed.replace(/\.+$/g, '');
  if (!normalized) {
    return null;
  }

  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function getAllowedVideoDomains(
  customAllowedDomains: string[]
): string[] {
  return Array.from(
    new Set([
      ...STARTER_VIDEO_ALLOWED_DOMAINS,
      ...customAllowedDomains
        .map((domain) => normalizeVideoDomainInput(domain))
        .filter((domain): domain is string => !!domain),
    ])
  ).sort();
}

export function matchesAllowedVideoDomain(
  hostname: string,
  allowedDomain: string
): boolean {
  return hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);
}

export function isAllowedVideoHostname(
  hostname: string,
  customAllowedDomains: string[]
): boolean {
  return getAllowedVideoDomains(customAllowedDomains).some((allowedDomain) =>
    matchesAllowedVideoDomain(hostname, allowedDomain)
  );
}

export function deriveVideoLibraryEntries(
  sessions: JudoSession[],
  customAllowedDomains: string[]
): VideoLibraryEntry[] {
  return sessions.map((session) => {
    const trimmedUrl = session.videoUrl?.trim();
    if (!trimmedUrl) {
      return {
        session,
        status: 'missing',
      };
    }

    try {
      const parsedUrl = new URL(trimmedUrl);
      if (
        (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
        isLikelyBlockedClientHostname(parsedUrl.hostname)
      ) {
        return {
          session,
          status: 'invalid_url',
          url: trimmedUrl,
        };
      }

      const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
      if (!isAllowedVideoHostname(hostname, customAllowedDomains)) {
        return {
          session,
          status: 'disallowed_domain',
          url: parsedUrl.toString(),
          hostname,
        };
      }

      return {
        session,
        status: 'allowed_unchecked',
        url: parsedUrl.toString(),
        hostname,
      };
    } catch {
      return {
        session,
        status: 'invalid_url',
        url: trimmedUrl,
      };
    }
  });
}

export function canCheckVideoEntry(entry: VideoLibraryEntry): boolean {
  return entry.status === 'allowed_unchecked' && !!entry.url && !!entry.hostname;
}
