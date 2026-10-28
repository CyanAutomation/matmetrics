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
const sessionListLoads = new Map<
  string,
  { generation: number; promise: Promise<SessionListPayload> }
>();
const sessionListGenerations = new Map<string, number>();
let nextSessionListGeneration = 0;
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

export async function getOrLoadSessionList(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined,
  load: () => Promise<SessionListPayload>,
  force = false
): Promise<SessionListPayload> {
  if (force) return load();

  const key = cacheKey(uid, config);
  const cached = getCachedSessionList(uid, config);
  if (cached) return cached;

  const generation = sessionListGenerations.get(key) ?? 0;
  const currentLoad = sessionListLoads.get(key);
  if (currentLoad?.generation === generation) return currentLoad.promise;

  const promise = load().then((payload) => {
    if ((sessionListGenerations.get(key) ?? 0) === generation) {
      cacheSessionList(uid, config, payload);
    }
    return payload;
  });
  const entry = { generation, promise };
  sessionListLoads.set(key, entry);

  try {
    return await promise;
  } finally {
    if (sessionListLoads.get(key) === entry) sessionListLoads.delete(key);
    if (!sessionListLoads.has(key)) sessionListGenerations.delete(key);
  }
}

export function invalidateSessionListCache(
  uid: string,
  config: Partial<GitHubConfig> | null | undefined
): void {
  const key = cacheKey(uid, config);
  sessionListCache.delete(key);
  if (sessionListLoads.has(key)) {
    nextSessionListGeneration += 1;
    sessionListGenerations.set(key, nextSessionListGeneration);
    sessionListLoads.delete(key);
  } else {
    sessionListGenerations.delete(key);
  }
}

export function __configureSessionListCacheForTests(options?: {
  maxEntries?: number;
  now?: () => number;
}): void {
  sessionListCache.clear();
  sessionListLoads.clear();
  sessionListGenerations.clear();
  nextSessionListGeneration = 0;
  sessionListCacheMaxEntries = options?.maxEntries ?? DEFAULT_SESSION_LIST_CACHE_MAX_ENTRIES;
  sessionListCacheNow = options?.now ?? (() => Date.now());
}
