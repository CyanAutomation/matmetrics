import type {
  JudoSession,
  SessionCategory,
  VideoLinkCheckSnapshot,
  VideoLinkCheckStatus,
} from '@/lib/types';

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

export type VideoLibraryTab = 'missing' | 'review' | 'checked' | 'all';
export type VideoLibraryCheckedFilter = 'all' | 'checked' | 'unchecked';
export type VideoLibraryStatusFilter =
  | 'all'
  | VideoLibraryEntryStatus
  | VideoLinkCheckStatus;

export interface VideoLibraryEntry {
  session: JudoSession;
  status: VideoLibraryEntryStatus;
  url?: string;
  hostname?: string;
}

export interface VideoLinkCheckResult extends VideoLinkCheckSnapshot {
  sessionId: string;
}

export interface VideoLibraryRow {
  session: JudoSession;
  entry: VideoLibraryEntry;
  latestCheck?: VideoLinkCheckSnapshot;
  displayStatus: VideoLibraryEntryStatus | VideoLinkCheckStatus;
  needsReview: boolean;
  isCheckable: boolean;
  isChecked: boolean;
  searchText: string;
}

export interface VideoLibraryFilters {
  tab: VideoLibraryTab;
  search: string;
  status: VideoLibraryStatusFilter;
  category: SessionCategory | 'all';
  hostname: string;
  checked: VideoLibraryCheckedFilter;
}

export interface VideoLibraryTabCounts {
  all: number;
  missing: number;
  review: number;
  checked: number;
}

export interface VideoDomainRemovalImpact {
  domain: string;
  affectedSessionCount: number;
  affectedSessionIds: string[];
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

function toNormalizedSessionUrl(session: JudoSession): {
  url: string;
  hostname: string;
} | null {
  const trimmedUrl = session.videoUrl?.trim();
  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    if (
      (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
      isLikelyBlockedClientHostname(parsedUrl.hostname)
    ) {
      return null;
    }

    return {
      url: parsedUrl.toString(),
      hostname: parsedUrl.hostname.toLowerCase().replace(/^www\./, ''),
    };
  } catch {
    return null;
  }
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

    const normalized = toNormalizedSessionUrl(session);
    if (!normalized) {
      return {
        session,
        status: 'invalid_url',
        url: trimmedUrl,
      };
    }

    if (!isAllowedVideoHostname(normalized.hostname, customAllowedDomains)) {
      return {
        session,
        status: 'disallowed_domain',
        url: normalized.url,
        hostname: normalized.hostname,
      };
    }

    return {
      session,
      status: 'allowed_unchecked',
      url: normalized.url,
      hostname: normalized.hostname,
    };
  });
}

export function canCheckVideoEntry(entry: VideoLibraryEntry): boolean {
  return entry.status === 'allowed_unchecked' && !!entry.url && !!entry.hostname;
}

export function reconcileVideoLinkChecks({
  sessions,
  customAllowedDomains,
  linkChecksBySessionId,
}: {
  sessions: JudoSession[];
  customAllowedDomains: string[];
  linkChecksBySessionId: Record<string, VideoLinkCheckSnapshot>;
}): Record<string, VideoLinkCheckSnapshot> {
  const reconciled: Record<string, VideoLinkCheckSnapshot> = {};

  for (const session of sessions) {
    const existing = linkChecksBySessionId[session.id];
    if (!existing) {
      continue;
    }

    const normalized = toNormalizedSessionUrl(session);
    if (!normalized) {
      continue;
    }

    const isAllowed = isAllowedVideoHostname(
      normalized.hostname,
      customAllowedDomains
    );
    const matchesCurrentResource =
      existing.url === normalized.url && existing.hostname === normalized.hostname;

    if (!matchesCurrentResource) {
      continue;
    }

    if (isAllowed && existing.status === 'disallowed_domain') {
      continue;
    }

    if (!isAllowed && existing.status !== 'disallowed_domain') {
      continue;
    }

    reconciled[session.id] = existing;
  }

  return reconciled;
}

export function mergeVideoLinkCheckResults({
  existing,
  results,
}: {
  existing: Record<string, VideoLinkCheckSnapshot>;
  results: VideoLinkCheckResult[];
}): Record<string, VideoLinkCheckSnapshot> {
  const merged = { ...existing };

  for (const result of results) {
    merged[result.sessionId] = {
      url: result.url,
      hostname: result.hostname,
      status: result.status,
      checkedAt: result.checkedAt,
      ...(typeof result.httpStatus === 'number'
        ? { httpStatus: result.httpStatus }
        : {}),
      ...(typeof result.error === 'string' ? { error: result.error } : {}),
    };
  }

  return merged;
}

export function areVideoLinkCheckMapsEqual(
  left: Record<string, VideoLinkCheckSnapshot>,
  right: Record<string, VideoLinkCheckSnapshot>
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const leftKey = leftKeys[index];
    const rightKey = rightKeys[index];
    if (leftKey !== rightKey) {
      return false;
    }

    const leftValue = left[leftKey];
    const rightValue = right[rightKey];
    if (
      leftValue.url !== rightValue.url ||
      leftValue.hostname !== rightValue.hostname ||
      leftValue.status !== rightValue.status ||
      leftValue.checkedAt !== rightValue.checkedAt ||
      leftValue.httpStatus !== rightValue.httpStatus ||
      leftValue.error !== rightValue.error
    ) {
      return false;
    }
  }

  return true;
}

function buildRowSearchText(row: {
  session: JudoSession;
  hostname?: string;
  latestCheck?: VideoLinkCheckSnapshot;
}): string {
  return [
    row.session.date,
    row.session.category,
    row.hostname ?? '',
    row.latestCheck?.hostname ?? '',
    row.session.techniques.join(' '),
    row.session.description ?? '',
    row.session.notes ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function deriveVideoLibraryRows({
  sessions,
  customAllowedDomains,
  linkChecksBySessionId,
}: {
  sessions: JudoSession[];
  customAllowedDomains: string[];
  linkChecksBySessionId: Record<string, VideoLinkCheckSnapshot>;
}): VideoLibraryRow[] {
  const entries = deriveVideoLibraryEntries(sessions, customAllowedDomains);

  return entries.map((entry) => {
    const latestCheck = linkChecksBySessionId[entry.session.id];
    const displayStatus = latestCheck?.status ?? entry.status;
    const needsReview =
      entry.status === 'missing' ||
      entry.status === 'invalid_url' ||
      entry.status === 'disallowed_domain' ||
      latestCheck?.status === 'broken' ||
      latestCheck?.status === 'check_failed' ||
      latestCheck?.status === 'disallowed_domain';

    return {
      session: entry.session,
      entry,
      latestCheck,
      displayStatus,
      needsReview,
      isCheckable: canCheckVideoEntry(entry),
      isChecked: !!latestCheck,
      searchText: buildRowSearchText({
        session: entry.session,
        hostname: entry.hostname,
        latestCheck,
      }),
    };
  });
}

export function getVideoLibraryTabCounts(
  rows: VideoLibraryRow[]
): VideoLibraryTabCounts {
  return {
    all: rows.length,
    missing: rows.filter((row) => row.entry.status === 'missing').length,
    review: rows.filter((row) => row.needsReview).length,
    checked: rows.filter((row) => row.isChecked).length,
  };
}

function rowMatchesTab(row: VideoLibraryRow, tab: VideoLibraryTab): boolean {
  switch (tab) {
    case 'missing':
      return row.entry.status === 'missing';
    case 'review':
      return row.needsReview;
    case 'checked':
      return row.isChecked;
    case 'all':
      return true;
  }
}

export function filterVideoLibraryRows(
  rows: VideoLibraryRow[],
  filters: VideoLibraryFilters
): VideoLibraryRow[] {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const normalizedHostname = filters.hostname.trim().toLowerCase();

  return rows.filter((row) => {
    if (!rowMatchesTab(row, filters.tab)) {
      return false;
    }

    if (filters.category !== 'all' && row.session.category !== filters.category) {
      return false;
    }

    if (filters.checked === 'checked' && !row.isChecked) {
      return false;
    }

    if (filters.checked === 'unchecked' && row.isChecked) {
      return false;
    }

    if (filters.status !== 'all') {
      const statuses = [row.entry.status, row.latestCheck?.status].filter(Boolean);
      if (!statuses.includes(filters.status)) {
        return false;
      }
    }

    if (normalizedHostname) {
      const hostnameHaystack = [
        row.entry.hostname ?? '',
        row.latestCheck?.hostname ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hostnameHaystack.includes(normalizedHostname)) {
        return false;
      }
    }

    if (normalizedSearch && !row.searchText.includes(normalizedSearch)) {
      return false;
    }

    return true;
  });
}

export function getVideoDomainRemovalImpact({
  domain,
  sessions,
  customAllowedDomains,
}: {
  domain: string;
  sessions: JudoSession[];
  customAllowedDomains: string[];
}): VideoDomainRemovalImpact {
  const normalizedDomain = normalizeVideoDomainInput(domain);
  if (!normalizedDomain) {
    return {
      domain,
      affectedSessionCount: 0,
      affectedSessionIds: [],
    };
  }

  const remainingDomains = customAllowedDomains.filter(
    (existing) => existing !== normalizedDomain
  );

  const affectedSessionIds = sessions
    .filter((session) => {
      const normalized = toNormalizedSessionUrl(session);
      if (!normalized) {
        return false;
      }

      const currentlyAllowed = isAllowedVideoHostname(
        normalized.hostname,
        customAllowedDomains
      );
      const allowedAfterRemoval = isAllowedVideoHostname(
        normalized.hostname,
        remainingDomains
      );

      return currentlyAllowed && !allowedAfterRemoval;
    })
    .map((session) => session.id);

  return {
    domain: normalizedDomain,
    affectedSessionCount: affectedSessionIds.length,
    affectedSessionIds,
  };
}
