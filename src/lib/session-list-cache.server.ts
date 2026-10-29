import type { GitHubConfig } from './types';
import { metric } from '@vercel/functions';
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
type SessionListCacheMetric = (
  name: string,
  value: number,
  tags?: Record<string, string>
) => void;
let recordCacheMetric: SessionListCacheMetric = metric;

function emitCacheMetric(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  try {
    recordCacheMetric(name, value, tags);
  } catch {
    // Metrics must never prevent a session refresh from completing.
  }
}

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
  if (force) {
    emitCacheMetric('sessions.list_cache.request', 1, { outcome: 'forced' });
    return loadAndMeasure(load);
  }

  const key = cacheKey(uid, config);
  const cached = getCachedSessionList(uid, config);
  if (cached) {
    emitCacheMetric('sessions.list_cache.request', 1, { outcome: 'hit' });
    return cached;
  }

  const generation = sessionListGenerations.get(key) ?? 0;
  const currentLoad = sessionListLoads.get(key);
  if (currentLoad?.generation === generation) {
    emitCacheMetric('sessions.list_cache.request', 1, { outcome: 'coalesced' });
    return currentLoad.promise;
  }
  emitCacheMetric('sessions.list_cache.request', 1, { outcome: 'miss' });

  const promise = loadAndMeasure(load)
    .then((payload) => {
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

async function loadAndMeasure(
  load: () => Promise<SessionListPayload>
): Promise<SessionListPayload> {
  const startedAt = Date.now();
  try {
    const payload = await load();
    emitCacheMetric('sessions.list_cache.load', 1, { outcome: 'success' });
    return payload;
  } catch (error) {
    emitCacheMetric('sessions.list_cache.load', 1, { outcome: 'error' });
    throw error;
  } finally {
    emitCacheMetric(
      'sessions.list_cache.load_duration_ms',
      Math.max(0, Date.now() - startedAt)
    );
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
  recordMetric?: SessionListCacheMetric;
}): void {
  sessionListCache.clear();
  sessionListLoads.clear();
  sessionListGenerations.clear();
  nextSessionListGeneration = 0;
  sessionListCacheMaxEntries = options?.maxEntries ?? DEFAULT_SESSION_LIST_CACHE_MAX_ENTRIES;
  sessionListCacheNow = options?.now ?? (() => Date.now());
  recordCacheMetric = options?.recordMetric ?? metric;
}
