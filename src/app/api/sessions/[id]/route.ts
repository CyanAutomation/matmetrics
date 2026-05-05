import { NextRequest, NextResponse } from 'next/server';
import { JudoSession, GitHubConfig } from '@/lib/types';
import {
  deleteSessionForConfig,
  isSessionNotFoundStorageError,
  normalizeGitHubConfig,
  readSessionByIdForConfig,
  updateSessionForConfig,
} from '@/lib/session-storage';
import {
  buildGitHubDeleteBody,
  buildGitHubSearchParams,
  buildGitHubSessionBody,
  proxyGoFunction,
  shouldProxyGitHubRequests,
} from '@/lib/go-function-proxy';
import { isDuplicateSessionIdError } from '@/lib/file-storage';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';
import { isBlockedNetworkHostname } from '@/lib/network-safety';

// TODO(P4): Validation logic (date, techniques, videoUrl, etc.) is duplicated
// between this TypeScript route handler and the Go backend
// (internal/sessionapi/validation.go). With P6 (dual backend support), both
// copies exist. See:
// https://github.com/CyanAutomation/matmetrics/issues/XXX
// A future refactor should consolidate validation into a shared layer or proxy
// all session mutations through a single backend.

/**
 * GET /api/sessions/[id]
 * Retrieve a specific session by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const { id } = await params;
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
      return proxyGoFunction(request, {
        path: '/api/go/sessions/get',
        method: 'GET',
        searchParams: new URLSearchParams({
          id,
          ...Object.fromEntries(buildGitHubSearchParams(gitHubConfig)),
        }),
      });
    }

    const session = await readSessionByIdForConfig(id, gitHubConfig);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    console.error('Error retrieving session', error);
    return NextResponse.json(
      { error: 'Failed to retrieve session' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sessions/[id]
 * Update an existing session.
 * If body.gitHubConfig is omitted, the server uses the user's stored GitHub config (when available).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const { id } = await params;
    const payload = await request.json();
    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const body = payload;

    // Ensure ID matches when explicitly provided in request body.
    if (body.id !== undefined && body.id !== id) {
      return NextResponse.json(
        { error: 'Session ID mismatch' },
        { status: 400 }
      );
    }

    const validation = validateSessionPayload(body as Record<string, unknown>, {
      routeId: id,
      generateIdWhenMissing: false,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const session: JudoSession = validation.session;

    const requestedGitHubConfig = normalizeGitHubConfig(
      body.gitHubConfig as GitHubConfig | undefined
    );
    const authzResult = await resolveAuthorizedGitHubConfig(
      user.uid,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse) {
      return authzResult.forbiddenResponse;
    }
    const gitHubConfig = authzResult.config;
    if (gitHubConfig && shouldProxyGitHubRequests(gitHubConfig)) {
      return proxyGoFunction(request, {
        path: '/api/go/sessions/update',
        method: 'PUT',
        body: buildGitHubSessionBody(session, gitHubConfig),
      });
    }

    await updateSessionForConfig(session, gitHubConfig);

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    if (isSessionNotFoundStorageError(error)) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (isDuplicateSessionIdError(error)) {
      return NextResponse.json(
        {
          error:
            'Session ID conflict: multiple session files share this ID. Resolve duplicates before updating.',
        },
        { status: 409 }
      );
    }

    console.error('Error updating session', error);
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/[id]
 * Delete a session.
 * If body.gitHubConfig is omitted, the server uses the user's stored GitHub config (when available).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const { id } = await params;
    const rawBody = await request.text();
    let body: Record<string, unknown> = {};

    if (rawBody.trim().length > 0) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      if (
        typeof parsedBody !== 'object' ||
        parsedBody === null ||
        Array.isArray(parsedBody)
      ) {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      body = parsedBody as Record<string, unknown>;
    }

    const requestedGitHubConfig = normalizeGitHubConfig(
      body.gitHubConfig as GitHubConfig | undefined
    );
    const authzResult = await resolveAuthorizedGitHubConfig(
      user.uid,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse) {
      return authzResult.forbiddenResponse;
    }
    const gitHubConfig = authzResult.config;
    if (gitHubConfig && shouldProxyGitHubRequests(gitHubConfig)) {
      return proxyGoFunction(request, {
        path: '/api/go/sessions/delete',
        method: 'DELETE',
        body: buildGitHubDeleteBody(id, gitHubConfig),
      });
    }

    await deleteSessionForConfig(id, gitHubConfig);

    return NextResponse.json({ message: 'Session deleted' }, { status: 200 });
  } catch (error) {
    if (isSessionNotFoundStorageError(error)) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (isDuplicateSessionIdError(error)) {
      return NextResponse.json(
        {
          error:
            'Session ID conflict: multiple session files share this ID. Resolve duplicates before deleting.',
        },
        { status: 409 }
      );
    }

    console.error('Error deleting session', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
