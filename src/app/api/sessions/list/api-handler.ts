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

function getDiagnosticRequestId(request: NextRequest): string | undefined {
  const requestId =
    request.headers.get('x-vercel-id') ??
    request.headers.get('x-request-id');
  return requestId && /^[a-zA-Z0-9:._-]{1,128}$/.test(requestId)
    ? requestId
    : undefined;
}

function getSafeErrorDetails(error: unknown): {
  errorName: string;
  errorCode?: string;
} {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const errorCode =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[a-zA-Z0-9:._-]{1,80}$/.test(error.code)
      ? error.code
      : undefined;
  return { errorName, ...(errorCode ? { errorCode } : {}) };
}

type SessionListHandlerContext = {
  requestId: string | undefined;
  startedAt: number;
  stage: string;
};

function logAuthenticationRejection(
  request: NextRequest,
  response: NextResponse,
  requestId: string | undefined
): NextResponse {
  const authorization = request.headers.get('authorization')?.trim();
  console.warn('session_list_auth_rejected', {
    event: 'session_list_auth_rejected',
    stage: 'authentication',
    status: response.status,
    authorizationHeaderPresent: request.headers.has('authorization'),
    bearerAuthorizationPresent: /^Bearer\s+\S+$/i.test(authorization ?? ''),
    ...(requestId ? { requestId } : {}),
  });
  return response;
}

function logRepositoryRejection(
  response: NextResponse,
  requestId: string | undefined
): NextResponse {
  console.warn('session_list_repository_rejected', {
    event: 'session_list_repository_rejected',
    stage: 'repository_authorization',
    status: response.status,
    ...(requestId ? { requestId } : {}),
  });
  return response;
}

function logProxyFailure(
  response: Response,
  context: SessionListHandlerContext
): void {
  if (response.status < 400) return;
  console.error('session_list_upstream_failed', {
    event: 'session_list_upstream_failed',
    stage: context.stage,
    status: response.status,
    durationMs: Date.now() - context.startedAt,
    ...(context.requestId ? { requestId: context.requestId } : {}),
  });
}

function logForcedProxyCompletion(
  request: NextRequest,
  response: Response,
  context: SessionListHandlerContext
): void {
  if (
    response.status >= 400 ||
    request.nextUrl.searchParams.get('force') !== '1'
  ) {
    return;
  }
  console.info('session_list_completed', {
    event: 'session_list_completed',
    stage: context.stage,
    source: 'go_proxy',
    status: response.status,
    durationMs: Date.now() - context.startedAt,
    ...(context.requestId ? { requestId: context.requestId } : {}),
  });
}

async function proxySessionList(
  request: NextRequest,
  config: NonNullable<Awaited<ReturnType<typeof normalizeGitHubConfig>>>,
  context: SessionListHandlerContext
): Promise<Response> {
  context.stage = 'go_proxy';
  const searchParams = buildGitHubSearchParams(config);
  if (request.nextUrl.searchParams.get('force') === '1') {
    searchParams.set('force', '1');
  }
  const response = await proxyGoFunction(request, {
    path: '/api/go/sessions/list',
    method: 'GET',
    searchParams,
  });
  logProxyFailure(response, context);
  logForcedProxyCompletion(request, response, context);
  return response;
}

async function respondFromSessionStorage(
  request: NextRequest,
  userId: string,
  config: Awaited<ReturnType<typeof normalizeGitHubConfig>>,
  context: SessionListHandlerContext
): Promise<NextResponse> {
  context.stage = 'session_storage';
  const force = request.nextUrl.searchParams.get('force') === '1';
  const cached = getCachedSessionList(userId, config);
  const result =
    !force && cached ? cached : await listSessionsForConfigWithIssues(config);
  if (!force && !cached) cacheSessionList(userId, config, result);

  const etag = createResponseEtag(result);
  const responseHeaders = {
    'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
    ETag: etag,
    Vary: 'Authorization',
  };
  if (!force && request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: responseHeaders });
  }
  if (force) {
    console.info('session_list_completed', {
      event: 'session_list_completed',
      stage: context.stage,
      source: !force && cached ? 'cache' : 'storage',
      status: 200,
      sessionCount: result.sessions.length,
      issueCount: result.issues.length,
      durationMs: Date.now() - context.startedAt,
      ...(context.requestId ? { requestId: context.requestId } : {}),
    });
  }
  return NextResponse.json(result, { status: 200, headers: responseHeaders });
}

function respondToSessionListFailure(
  error: unknown,
  context: SessionListHandlerContext
): NextResponse {
  const storageResponse = persistentSessionStorageUnavailableResponse(error);
  if (storageResponse) {
    console.error('session_list_storage_unavailable', {
      event: 'session_list_storage_unavailable',
      stage: context.stage,
      status: storageResponse.status,
      durationMs: Date.now() - context.startedAt,
      ...getSafeErrorDetails(error),
      ...(context.requestId ? { requestId: context.requestId } : {}),
    });
    return storageResponse;
  }

  console.error('session_list_handler_failed', {
    event: 'session_list_handler_failed',
    stage: context.stage,
    status: 500,
    durationMs: Date.now() - context.startedAt,
    ...getSafeErrorDetails(error),
    ...(context.requestId ? { requestId: context.requestId } : {}),
  });
  return NextResponse.json(
    { error: 'Failed to list sessions' },
    { status: 500 }
  );
}

/**
 * GET /api/sessions/list
 * Returns all sessions from the markdown files, sorted by date (newest first)
 */
export async function GET(request: NextRequest) {
  const context: SessionListHandlerContext = {
    requestId: getDiagnosticRequestId(request),
    startedAt: Date.now(),
    stage: 'authentication',
  };

  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse)
      return logAuthenticationRejection(request, user, context.requestId);

    context.stage = 'repository_authorization';
    const requestedGitHubConfig = normalizeGitHubConfig({
      owner: request.nextUrl.searchParams.get('owner') ?? undefined,
      repo: request.nextUrl.searchParams.get('repo') ?? undefined,
      branch: request.nextUrl.searchParams.get('branch') ?? undefined,
    });
    const authzResult = await resolveAuthorizedGitHubConfig(
      user.appUserId,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse)
      return logRepositoryRejection(
        authzResult.forbiddenResponse,
        context.requestId
      );
    const gitHubConfig = authzResult.config;

    if (gitHubConfig && shouldProxyGitHubRequests(gitHubConfig))
      return await proxySessionList(request, gitHubConfig, context);
    return await respondFromSessionStorage(
      request,
      user.appUserId,
      gitHubConfig,
      context
    );
  } catch (error) {
    return respondToSessionListFailure(error, context);
  }
}
