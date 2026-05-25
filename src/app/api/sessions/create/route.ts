import { NextRequest, NextResponse } from 'next/server';
import { JudoSession, GitHubConfig } from '@/lib/types';
import {
  createSessionForConfig,
  normalizeGitHubConfig,
  SessionCreationConflictError,
  isSessionCreationConflictError,
} from '@/lib/session-storage';
import { GitHubSessionCreationConflictError } from '@/lib/github-storage';
import {
  buildGitHubSessionBody,
  proxyGoFunction,
  shouldProxyGitHubRequests,
} from '@/lib/go-function-proxy';
import { requireAuthenticatedUser } from '@/lib/server-auth';
import { resolveAuthorizedGitHubConfig } from '@/lib/server-github-authz';
import { validateSessionPayload } from '@/lib/session-validation';

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
      user.uid,
      requestedGitHubConfig
    );
    if (authzResult.forbiddenResponse) {
      return authzResult.forbiddenResponse;
    }
    const gitHubConfig = authzResult.config;
    if (gitHubConfig && shouldProxyGitHubRequests(gitHubConfig)) {
      return proxyGoFunction(request, {
        path: '/api/go/sessions/create',
        method: 'POST',
        body: buildGitHubSessionBody(session, gitHubConfig),
      });
    }

    await createSessionForConfig(session, gitHubConfig);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    // Handle session creation conflicts with typed errors
    if (isSessionCreationConflictError(error)) {
      return NextResponse.json(
        {
          error: CREATE_CONFLICT_ERROR,
        },
        { status: 409 }
      );
    }

    // Handle GitHub session creation conflicts
    if (isGitHubSessionCreationConflictError(error)) {
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
