import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import {
  listSessionsForConfigWithIssues,
  normalizeGitHubConfig,
} from '@/lib/session-storage';
import {
  buildGitHubSearchParams,
  proxyGoFunction,
  shouldProxyGitHubRequests,
} from '@/lib/go-function-proxy';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';

const SESSION_LIST_CACHE_TTL_MS = 30_000;
const sessionListCache = new Map<
  string,
  {
    expiresAt: number;
    payload: Awaited<ReturnType<typeof listSessionsForConfigWithIssues>>;
  }
>();

function sessionListCacheKey(
  uid: string,
  config: ReturnType<typeof normalizeGitHubConfig>
): string {
  return `${uid}:${config?.owner ?? 'local'}/${config?.repo ?? ''}:${config?.branch ?? ''}`;
}

function createResponseEtag(payload: unknown): string {
  return `"${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}"`;
}

/**
 * GET /api/sessions/list
 * Returns all sessions from the markdown files, sorted by date (newest first)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const requestedGitHubConfig = normalizeGitHubConfig({
      owner: request.nextUrl.searchParams.get('owner') ?? undefined,
      repo: request.nextUrl.searchParams.get('repo') ?? undefined,
      branch: request.nextUrl.searchParams.get('branch') ?? undefined,
    });
    const authzResult = await resolveAuthorizedGitHubConfig(
      user.uid,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse) {
      return authzResult.forbiddenResponse;
    }
    const gitHubConfig = authzResult.config;

    if (gitHubConfig && shouldProxyGitHubRequests(gitHubConfig)) {
      const searchParams = buildGitHubSearchParams(gitHubConfig);
      if (request.nextUrl.searchParams.get('force') === '1') {
        searchParams.set('force', '1');
      }
      return proxyGoFunction(request, {
        path: '/api/go/sessions/list',
        method: 'GET',
        searchParams,
      });
    }

    const force = request.nextUrl.searchParams.get('force') === '1';
    const cacheKey = sessionListCacheKey(user.uid, gitHubConfig);
    const cached = sessionListCache.get(cacheKey);
    const result =
      !force && cached && cached.expiresAt > Date.now()
        ? cached.payload
        : await listSessionsForConfigWithIssues(gitHubConfig);

    if (!force && (!cached || cached.payload !== result)) {
      sessionListCache.set(cacheKey, {
        payload: result,
        expiresAt: Date.now() + SESSION_LIST_CACHE_TTL_MS,
      });
    }

    const etag = createResponseEtag(result);
    const responseHeaders = {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
      ETag: etag,
      Vary: 'Authorization',
    };
    if (!force && request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: responseHeaders });
    }
    return NextResponse.json(result, { status: 200, headers: responseHeaders });
  } catch (error) {
    console.error('Error listing sessions', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
