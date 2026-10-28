import { unstable_cache } from 'next/cache';
import { APP_VERSION } from '@/lib/app-version';

const PLUGIN_CACHE_TTL_SECONDS = 60 * 60;
const BUILD_CACHE_KEY =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.SENTRY_RELEASE ??
  process.env.NEXT_BUILD_ID ??
  APP_VERSION;

/**
 * Cache deployment-stable plugin data across requests. Development and tests
 * read from disk each time so edits and temporary plugin fixtures stay visible.
 */
export function cacheStablePluginData<Arguments extends unknown[], Result>(
  cacheName: string,
  load: (...args: Arguments) => Promise<Result>
): (...args: Arguments) => Promise<Result> {
  const cachedLoad = unstable_cache(
    load as unknown as (...args: any[]) => Promise<Result>,
    [`matmetrics:${cacheName}:v1`, BUILD_CACHE_KEY],
    {
      revalidate: PLUGIN_CACHE_TTL_SECONDS,
      tags: [`matmetrics-plugin-${cacheName}`],
    }
  ) as unknown as (...args: Arguments) => Promise<Result>;

  return (...args) =>
    process.env.NODE_ENV === 'production' ? cachedLoad(...args) : load(...args);
}
