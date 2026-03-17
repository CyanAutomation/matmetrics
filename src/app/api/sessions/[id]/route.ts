import { NextRequest, NextResponse } from 'next/server';
import { JudoSession, GitHubConfig } from '@/lib/types';
import {
  deleteSessionForConfig,
  normalizeGitHubConfig,
  readSessionByIdForConfig,
  updateSessionForConfig,
} from '@/lib/session-storage';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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

function isSessionNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    return /Session with ID .* not found/.test(error.message) || /GitHub session not found/.test(error.message);
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
    const gitHubConfig = normalizeGitHubConfig({
      owner: request.nextUrl.searchParams.get('owner') ?? undefined,
      repo: request.nextUrl.searchParams.get('repo') ?? undefined,
      branch: request.nextUrl.searchParams.get('branch') ?? undefined,
    });
    const session = await readSessionByIdForConfig(id, gitHubConfig);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
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

    const gitHubConfig = normalizeGitHubConfig(body.gitHubConfig as GitHubConfig | undefined);
    await updateSessionForConfig(session, gitHubConfig);

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    if (isSessionNotFoundError(error)) {
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
    const gitHubConfig = normalizeGitHubConfig(body?.gitHubConfig as GitHubConfig | undefined);
    await deleteSessionForConfig(id, gitHubConfig);

    return NextResponse.json({ message: 'Session deleted' }, { status: 200 });
  } catch (error) {
    if (isSessionNotFoundError(error)) {
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
