// Internal handler dispatched by app/api/[...path]/route.ts.
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
import { persistentSessionStorageUnavailableResponse } from '@/lib/session-storage-http';
import {
  cacheSessionList,
  getCachedSessionList,
} from '@/lib/session-list-cache.server';

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
    const cached = getCachedSessionList(user.uid, gitHubConfig);
    const result =
      !force && cached
        ? cached
        : await listSessionsForConfigWithIssues(gitHubConfig);

    if (!force && !cached) {
      cacheSessionList(user.uid, gitHubConfig, result);
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
    const storageResponse =
      persistentSessionStorageUnavailableResponse(error);
    if (storageResponse) return storageResponse;

    console.error('Error listing sessions', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
