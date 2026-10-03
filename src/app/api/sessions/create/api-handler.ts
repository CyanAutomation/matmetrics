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
import { validateSessionPayload } from '@/lib/session-validation';
import { parseJsonObjectBody } from '@/lib/request-body';
import { invalidateSessionListCache } from '@/lib/session-list-cache.server';
import { persistentSessionStorageUnavailableResponse } from '@/lib/session-storage-http';

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

    const payload = await parseJsonObjectBody(request);
    if (!payload.ok) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const body = payload.value;

    const validation = validateSessionPayload(body as Record<string, unknown>, {
      generateIdWhenMissing: true,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const session: JudoSession = validation.session;

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
