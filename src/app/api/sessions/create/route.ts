import { NextRequest, NextResponse } from 'next/server';
import { BlobStorageDisabledError, createSession } from '@/lib/vercel-blob-storage';
import { createSessionOnGitHub, getGitHubSessionPath, isGitHubConfigured } from '@/lib/github-storage';
import { JudoSession, GitHubConfig } from '@/lib/types';

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

    if (!Array.isArray(body.techniques)) {
      return NextResponse.json(
        { error: 'Techniques must be an array' },
        { status: 400 }
      );
    }

    const session: JudoSession = {
      id,
      date: body.date,
      effort: body.effort,
      category: body.category,
      techniques: body.techniques,
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
