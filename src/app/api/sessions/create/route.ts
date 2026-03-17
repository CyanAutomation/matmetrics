import { NextRequest, NextResponse } from 'next/server';
import { BlobStorageDisabledError, createSession } from '@/lib/vercel-blob-storage';
import { createSessionOnGitHub, getGitHubSessionPath, isGitHubConfigured } from '@/lib/github-storage';
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

/**
 * POST /api/sessions/create
 * Create a new session and save it as a markdown file
 * 
 * Request body: Partial JudoSession (id will be generated if not provided) + optional gitHubConfig
 * Response: Created JudoSession with id
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Generate ID if not provided (format: timestamp-based)
    const id =
      body.id || `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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

    // Save to Vercel Blob (primary storage)
    // Duplicate IDs are handled idempotently inside createSession.
    await createSession(session);

    let warning: string | undefined;

    // Attempt GitHub sync (best-effort, don't fail if error)
    const gitHubConfig = body.gitHubConfig as GitHubConfig | undefined;
    if (gitHubConfig && isGitHubConfigured()) {
      try {
        const result = await createSessionOnGitHub(session, gitHubConfig);
        if (!result.success) {
          warning = result.message;
          console.warn('GitHub session create sync reported failure', {
            sessionId: session.id,
            filePath: result.filePath ?? getGitHubSessionPath(session),
            message: result.message,
          });
        }
      } catch (error) {
        // Log error but don't fail the request
        console.warn('Failed to sync session to GitHub:', error);
      }
    }

    return NextResponse.json(
      {
        ...session,
        ...(warning ? { warning } : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    if (isBlobStorageDisabledError(error)) {
      return blobStorageDisabledResponse();
    }

    console.error('Error creating session', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
