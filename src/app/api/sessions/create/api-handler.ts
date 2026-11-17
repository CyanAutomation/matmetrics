// Internal handler dispatched by app/api/[...path]/route.ts.
import { NextRequest, NextResponse } from 'next/server';
import { JudoSession, GitHubConfig } from '@/lib/types';
import {
  createSessionForConfig,
  normalizeGitHubConfig,
} from '@/lib/session-storage';
import {
  buildGitHubSessionBody,
  proxyGoFunction,
  shouldProxyGitHubRequests,
} from '@/lib/go-function-proxy';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';
import { prepareSessionCreate } from '@/lib/session-create-request';
import { parseJsonObjectBody } from '@/lib/request-body';
import { invalidateSessionListCache } from '@/lib/session-list-cache.server';
import { persistentSessionStorageUnavailableResponse } from '@/lib/session-storage-http';
import {
  forwardSessionRequestToKeiko,
  isKeikoCutoverUser,
  keikoSessionRecordResponse,
} from '@/lib/keiko-session-gateway.server';
import { isValidIdempotencyKey } from '@/lib/keiko-api/idempotency';

const CREATE_CONFLICT_ERROR =
  'Session conflict: this ID already exists with different content. Use a new ID or update the existing session.';

/**
 * POST /api/sessions/create
 * Create a new session and save it as a markdown file
 *
 * Request body: Partial JudoSession (id will be generated if not provided) + optional gitHubConfig.
 * If gitHubConfig is omitted, the server uses the user's stored GitHub config (when available).
 * Response: Created JudoSession with id
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey !== null && !isValidIdempotencyKey(idempotencyKey)) {
      return NextResponse.json(
        { error: 'Idempotency-Key must contain 1 to 128 ASCII letters, digits, periods, underscores, tildes, or hyphens' },
        { status: 400 }
      );
    }

    const payload = await parseJsonObjectBody(request);
    if (!payload.ok) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const body = payload.value;
    const useKeiko = isKeikoCutoverUser(user.appUserId);
    if (useKeiko && process.env.KEIKO_IDEMPOTENT_CREATE_ENABLED !== 'true') {
      return NextResponse.json(
        { error: { code: 'idempotency_unavailable' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (useKeiko && idempotencyKey === null) {
      return NextResponse.json(
        { error: { code: 'idempotency_key_required' } },
        { status: 428, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const prepared = prepareSessionCreate(
      body,
      useKeiko && idempotencyKey !== null
    );
    if (!prepared.ok) {
      return NextResponse.json({ error: prepared.error }, { status: 400 });
    }

    const session: JudoSession = prepared.session;

    if (useKeiko) {
      const response = await forwardSessionRequestToKeiko(request, user, {
        path: '/v1/sessions',
        method: 'POST',
        scope: 'sessions:write',
        body: prepared.keikoBody,
        ...(idempotencyKey === null ? {} : { idempotencyKey }),
      });
      if (response.ok) invalidateSessionListCache(user.appUserId, undefined);
      return keikoSessionRecordResponse(response);
    }

    const requestedGitHubConfig = normalizeGitHubConfig(
      body.gitHubConfig as GitHubConfig | undefined
    );
    const authzResult = await resolveAuthorizedGitHubConfig(
      user.appUserId,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse) {
      return authzResult.forbiddenResponse;
    }
    const gitHubConfig = authzResult.config;
    if (gitHubConfig && shouldProxyGitHubRequests(gitHubConfig)) {
      const response = await proxyGoFunction(request, {
        path: '/api/go/sessions/create',
        method: 'POST',
        body: buildGitHubSessionBody(session, gitHubConfig),
      });
      if (response.ok) {
        invalidateSessionListCache(user.appUserId, gitHubConfig);
      }
      return response;
    }

    await createSessionForConfig(session, gitHubConfig);
    invalidateSessionListCache(user.appUserId, gitHubConfig);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    const storageResponse =
      persistentSessionStorageUnavailableResponse(error);
    if (storageResponse) return storageResponse;

    const errorMessage =
      error instanceof Error ? error.message : String(error ?? '');

    if (errorMessage.includes('already exists')) {
      return NextResponse.json(
        {
          error: CREATE_CONFLICT_ERROR,
        },
        { status: 409 }
      );
    }

    console.error('Error creating session', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
