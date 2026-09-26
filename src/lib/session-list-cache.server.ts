import type { GitHubConfig } from './types';
import {
  listSessionsForConfigWithIssues,
  normalizeGitHubConfig,
} from './session-storage';

const SESSION_LIST_CACHE_TTL_MS = 30_000;

type SessionListPayload = Awaited<
  ReturnType<typeof listSessionsForConfigWithIssues>
>;

type SessionListCacheEntry = {
  expiresAt: number;
  payload: SessionListPayload;
};

const sessionListCache = new Map<string, SessionListCacheEntry>();

function cacheKey(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined
): string {
  const normalizedConfig = normalizeGitHubConfig(config);
  return `${uid}:${normalizedConfig?.owner ?? 'local'}/${normalizedConfig?.repo ?? ''}:${normalizedConfig?.branch ?? ''}`;
}

export function getCachedSessionList(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined
): SessionListPayload | undefined {
  const key = cacheKey(uid, config);
  const cached = sessionListCache.get(key);

  if (!cached) {
    return undefined;
  }
  if (cached.expiresAt <= Date.now()) {
    sessionListCache.delete(key);
    return undefined;
  }

  return cached.payload;
}

export function cacheSessionList(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined,
  payload: SessionListPayload
): void {
  sessionListCache.set(cacheKey(uid, config), {
    payload,
    expiresAt: Date.now() + SESSION_LIST_CACHE_TTL_MS,
  });
}

export function invalidateSessionListCache(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined
): void {
  sessionListCache.delete(cacheKey(uid, config));
}
