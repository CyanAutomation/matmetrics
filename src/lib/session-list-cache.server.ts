import type { GitHubConfig } from './types';
import {
  listSessionsForConfigWithIssues,
  normalizeGitHubConfig,
} from './session-storage';

const SESSION_LIST_CACHE_TTL_MS = 30_000;
const DEFAULT_SESSION_LIST_CACHE_MAX_ENTRIES = 100;

type SessionListPayload = Awaited<
  ReturnType<typeof listSessionsForConfigWithIssues>
>;

type SessionListCacheEntry = {
  expiresAt: number;
  payload: SessionListPayload;
};

const sessionListCache = new Map<string, SessionListCacheEntry>();
let sessionListCacheNow = () => Date.now();
let sessionListCacheMaxEntries = readPositiveInteger(
  process.env.SESSION_LIST_CACHE_MAX_ENTRIES,
  DEFAULT_SESSION_LIST_CACHE_MAX_ENTRIES
);

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pruneSessionListCache(now: number): void {
  for (const [key, entry] of sessionListCache) {
    if (entry.expiresAt <= now) {
      sessionListCache.delete(key);
    }
  }
}

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
  const now = sessionListCacheNow();
  pruneSessionListCache(now);
  const key = cacheKey(uid, config);
  const cached = sessionListCache.get(key);

  if (!cached) {
    return undefined;
  }
  // Refresh insertion order so capacity eviction behaves as an LRU.
  sessionListCache.delete(key);
  sessionListCache.set(key, cached);
  return cached.payload;
}

export function cacheSessionList(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined,
  payload: SessionListPayload
): void {
  const now = sessionListCacheNow();
  pruneSessionListCache(now);
  const key = cacheKey(uid, config);
  sessionListCache.delete(key);
  sessionListCache.set(key, {
    payload,
    expiresAt: now + SESSION_LIST_CACHE_TTL_MS,
  });
  while (sessionListCache.size > sessionListCacheMaxEntries) {
    const oldestKey = sessionListCache.keys().next().value;
    if (oldestKey === undefined) break;
    sessionListCache.delete(oldestKey);
  }
}

export function invalidateSessionListCache(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined
): void {
  sessionListCache.delete(cacheKey(uid, config));
}

export function __configureSessionListCacheForTests(options?: {
  maxEntries?: number;
  now?: () => number;
}): void {
  sessionListCache.clear();
  sessionListCacheMaxEntries = options?.maxEntries ?? DEFAULT_SESSION_LIST_CACHE_MAX_ENTRIES;
  sessionListCacheNow = options?.now ?? (() => Date.now());
}
