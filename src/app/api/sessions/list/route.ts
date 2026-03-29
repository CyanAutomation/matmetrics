import { NextRequest, NextResponse } from 'next/server';
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

    const result = await listSessionsForConfigWithIssues(gitHubConfig);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error listing sessions', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
