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

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function validateDate(
  dateValue: unknown
): { valid: true; date: string } | { valid: false; error: string } {
  if (typeof dateValue !== 'string') {
    return { valid: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  }

  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) {
    return { valid: false, error: 'Invalid date: expected YYYY-MM-DD format' };
  }

  const [, yearString, monthString, dayString] = match;
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return {
      valid: false,
      error: 'Invalid date: must be a real calendar date',
    };
  }

  return { valid: true, date: dateValue };
}

function validateTechniques(
  techniquesValue: unknown
): { valid: true; techniques: string[] } | { valid: false; error: string } {
  if (!Array.isArray(techniquesValue)) {
    return {
      valid: false,
      error: 'Invalid techniques: expected an array of non-empty strings',
    };
  }

  const normalized: string[] = [];

  for (let index = 0; index < techniquesValue.length; index += 1) {
    const technique = techniquesValue[index];
    if (typeof technique !== 'string') {
      return {
        valid: false,
        error: `Invalid techniques[${index}]: expected a string`,
      };
    }

    const trimmed = technique.trim();
    if (!trimmed) {
      return {
        valid: false,
        error: `Invalid techniques[${index}]: value cannot be empty`,
      };
    }

    normalized.push(trimmed);
  }

  return {
    valid: true,
    techniques: [...new Set(normalized)],
  };
}

function validateOptionalString(
  value: unknown,
  fieldName: 'description' | 'notes'
):
  | { valid: true; value: string | undefined }
  | { valid: false; error: string } {
  if (value === undefined) {
    return { valid: true, value: undefined };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: `Invalid ${fieldName}: expected a string` };
  }

  return { valid: true, value };
}

function validateOptionalVideoUrl(
  value: unknown
):
  | { valid: true; videoUrl: string | undefined }
  | { valid: false; error: string } {
  if (value === undefined) {
    return { valid: true, videoUrl: undefined };
  }

  if (typeof value !== 'string') {
    return { valid: false, error: 'Invalid videoUrl: expected a string' };
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return {
      valid: false,
      error: 'Invalid videoUrl: expected a valid absolute URL',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    return {
      valid: false,
      error: 'Invalid videoUrl: expected a valid absolute URL',
    };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Invalid videoUrl: protocol must be http or https',
    };
  }

  if (isBlockedNetworkHostname(parsedUrl.hostname)) {
    return {
      valid: false,
      error:
        'Invalid videoUrl: private or internal network addresses are not allowed',
    };
  }

  return { valid: true, videoUrl: parsedUrl.toString() };
}

function validateDuration(
  value: unknown
):
  | { valid: true; duration: number | undefined }
  | { valid: false; error: string } {
  if (value === undefined) {
    return { valid: true, duration: undefined };
  }

  if (!Number.isInteger(value) || (value as number) < 0) {
    return {
      valid: false,
      error: 'Invalid duration: expected a non-negative integer',
    };
  }

  return { valid: true, duration: value as number };
}

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

    // Ensure ID matches
    if (body.id !== id) {
      return NextResponse.json(
        { error: 'Session ID mismatch' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.date) {
      return NextResponse.json(
        { error: 'Missing required field: date' },
        { status: 400 }
      );
    }

    const dateValidation = validateDate(body.date);
    if (!dateValidation.valid) {
      return NextResponse.json(
        { error: dateValidation.error },
        { status: 400 }
      );
    }

    if (!Number.isInteger(body.effort) || body.effort < 1 || body.effort > 5) {
      return NextResponse.json(
        { error: 'Invalid effort level (must be an integer 1-5)' },
        { status: 400 }
      );
    }

    if (!['Technical', 'Randori', 'Shiai'].includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const techniquesValidation = validateTechniques(body.techniques);
    if (!techniquesValidation.valid) {
      return NextResponse.json(
        { error: techniquesValidation.error },
        { status: 400 }
      );
    }

    const descriptionValidation = validateOptionalString(
      body.description,
      'description'
    );
    if (!descriptionValidation.valid) {
      return NextResponse.json(
        { error: descriptionValidation.error },
        { status: 400 }
      );
    }

    const notesValidation = validateOptionalString(body.notes, 'notes');
    if (!notesValidation.valid) {
      return NextResponse.json(
        { error: notesValidation.error },
        { status: 400 }
      );
    }

    const videoUrlValidation = validateOptionalVideoUrl(body.videoUrl);
    if (!videoUrlValidation.valid) {
      return NextResponse.json(
        { error: videoUrlValidation.error },
        { status: 400 }
      );
    }

    const durationValidation = validateDuration(body.duration);
    if (!durationValidation.valid) {
      return NextResponse.json(
        { error: durationValidation.error },
        { status: 400 }
      );
    }

    const session: JudoSession = {
      id,
      date: dateValidation.date,
      effort: body.effort,
      category: body.category,
      techniques: techniquesValidation.techniques,
      ...(descriptionValidation.value !== undefined && {
        description: descriptionValidation.value,
      }),
      ...(notesValidation.value !== undefined && {
        notes: notesValidation.value,
      }),
      ...(videoUrlValidation.videoUrl !== undefined && {
        videoUrl: videoUrlValidation.videoUrl,
      }),
      ...(durationValidation.duration !== undefined && {
        duration: durationValidation.duration,
      }),
    };

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
