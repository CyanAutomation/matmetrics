import { NextRequest, NextResponse } from 'next/server';
import { BlobStorageDisabledError, SessionLookupError, findSessionFileById, readSessionByPath, updateSession, deleteSession, listSessions } from '@/lib/vercel-blob-storage';
import { updateSessionOnGitHub, deleteSessionOnGitHub, deleteSessionOnGitHubById, getGitHubSessionPath, isGitHubConfigured } from '@/lib/github-storage';
import { JudoSession, GitHubConfig } from '@/lib/types';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;


function isBlobStorageDisabledError(error: unknown): boolean {
  return error instanceof BlobStorageDisabledError;
}

function blobStorageDisabledResponse() {
  return NextResponse.json(
    {
      error: 'Cloud persistence is temporarily unavailable',
      code: 'BLOB_STORAGE_DISABLED',
    },
    { status: 503 }
  );
}


function validateDate(dateValue: unknown): { valid: true; date: string } | { valid: false; error: string } {
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
    return { valid: false, error: 'Invalid date: must be a real calendar date' };
  }

  return { valid: true, date: dateValue };
}

function validateTechniques(
  techniquesValue: unknown
): { valid: true; techniques: string[] } | { valid: false; error: string } {
  if (!Array.isArray(techniquesValue)) {
    return { valid: false, error: 'Invalid techniques: expected an array of non-empty strings' };
  }

  const normalized: string[] = [];

  for (let index = 0; index < techniquesValue.length; index += 1) {
    const technique = techniquesValue[index];
    if (typeof technique !== 'string') {
      return { valid: false, error: `Invalid techniques[${index}]: expected a string` };
    }

    const trimmed = technique.trim();
    if (!trimmed) {
      return { valid: false, error: `Invalid techniques[${index}]: value cannot be empty` };
    }

    normalized.push(trimmed);
  }

  return {
    valid: true,
    techniques: [...new Set(normalized)],
  };
}

function isSessionLookupNotFoundError(error: unknown): boolean {
  return error instanceof SessionLookupError && error.kind === 'not_found';
}

function isSessionNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    return /Session with ID .* not found/.test(error.message);
  }

  if (typeof error === 'string') {
    return /Session with ID .* not found/.test(error);
  }

  return false;
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
    const { id } = await params;

    // Find the session by ID (this also reads the content)
    const blobPath = await findSessionFileById(id);
    if (!blobPath) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    const session = await readSessionByPath(blobPath);
    
    // Validate that the retrieved session matches the requested ID
    if (session.id !== id) {
      console.error(`Session ID mismatch: requested ${id}, found ${session.id} at ${blobPath}`);
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    if (isBlobStorageDisabledError(error)) {
      return blobStorageDisabledResponse();
    }

    if (isSessionLookupNotFoundError(error)) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    console.error('Error retrieving session', error);
    return NextResponse.json(
      { error: 'Failed to retrieve session' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sessions/[id]
 * Update an existing session
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

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

    if (typeof body.effort !== 'number' || body.effort < 1 || body.effort > 5) {
      return NextResponse.json(
        { error: 'Invalid effort level (must be 1-5)' },
        { status: 400 }
      );
    }

    if (!['Technical', 'Randori', 'Shiai'].includes(body.category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    const techniquesValidation = validateTechniques(body.techniques);
    if (!techniquesValidation.valid) {
      return NextResponse.json(
        { error: techniquesValidation.error },
        { status: 400 }
      );
    }

    const session: JudoSession = {
      id,
      date: dateValidation.date,
      effort: body.effort,
      category: body.category,
      techniques: techniquesValidation.techniques,
      ...(body.description && { description: body.description }),
      ...(body.notes && { notes: body.notes }),
      ...(body.duration !== undefined && { duration: body.duration }),
    };

    // Update in Vercel Blob (primary storage)
    await updateSession(session);

    let warning: string | undefined;

    // Attempt GitHub sync (best-effort, don't fail if error)
    const gitHubConfig = body.gitHubConfig as GitHubConfig | undefined;
    if (gitHubConfig && isGitHubConfigured()) {
      try {
        const result = await updateSessionOnGitHub(session, gitHubConfig);
        if (!result.success) {
          warning = result.message;
          console.warn('GitHub session update sync reported failure', {
            sessionId: session.id,
            filePath: result.filePath ?? getGitHubSessionPath(session),
            message: result.message,
          });
        }
      } catch (error) {
        // Log error but don't fail the request
        console.warn('Failed to sync session update to GitHub:', error);
      }
    }

    return NextResponse.json(
      {
        ...session,
        ...(warning ? { warning } : {}),
      },
      { status: 200 }
    );
  } catch (error) {
    if (isBlobStorageDisabledError(error)) {
      return blobStorageDisabledResponse();
    }

    if (isSessionLookupNotFoundError(error) || isSessionNotFoundError(error)) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
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
 * Delete a session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // Capture current session before deletion so GitHub path resolution can use real date/id.
    const existingSessions = await listSessions();
    const existingSession = existingSessions.find((session) => session.id === id);

    // Delete from Vercel Blob (primary storage)
    await deleteSession(id);

    let warning: string | undefined;

    // Attempt GitHub sync (best-effort, don't fail if error)
    const gitHubConfig = body?.gitHubConfig as GitHubConfig | undefined;
    if (gitHubConfig && isGitHubConfigured()) {
      try {
        const result = existingSession
          ? await deleteSessionOnGitHub(existingSession, gitHubConfig)
          : await deleteSessionOnGitHubById(id, gitHubConfig);

        if (!result.success) {
          warning = result.message;
          console.warn('GitHub session delete sync reported failure', {
            sessionId: id,
            filePath:
              result.filePath ?? (existingSession ? getGitHubSessionPath(existingSession) : undefined),
            message: result.message,
          });
        }
      } catch (error) {
        // Log error but don't fail the request
        console.warn('Failed to sync session deletion to GitHub:', error);
      }
    }

    return NextResponse.json(
      {
        message: 'Session deleted',
        ...(warning ? { warning } : {}),
      },
      { status: 200 }
    );
  } catch (error) {
    if (isBlobStorageDisabledError(error)) {
      return blobStorageDisabledResponse();
    }

    if (isSessionLookupNotFoundError(error) || isSessionNotFoundError(error)) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    console.error('Error deleting session', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
