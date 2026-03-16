import { NextRequest, NextResponse } from 'next/server';
import { findSessionFileById, updateSession, deleteSession, listSessions } from '@/lib/vercel-blob-storage';
import { markdownToSession, sessionToMarkdown } from '@/lib/markdown-serializer';
import { updateSessionOnGitHub, deleteSessionOnGitHub, isGitHubConfigured } from '@/lib/github-storage';
import { JudoSession, GitHubConfig } from '@/lib/types';

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

    // Get the session from the list since we have all sessions cached
    const sessions = await listSessions();
    const session = sessions.find(s => s.id === id);
    
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

    // Update in Vercel Blob (primary storage)
    await updateSession(session);

    // Attempt GitHub sync (best-effort, don't fail if error)
    const gitHubConfig = body.gitHubConfig as GitHubConfig | undefined;
    if (gitHubConfig && isGitHubConfigured()) {
      try {
        await updateSessionOnGitHub(session, gitHubConfig);
      } catch (error) {
        // Log error but don't fail the request
        console.warn('Failed to sync session update to GitHub:', error);
      }
    }

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

    // Delete from Vercel Blob (primary storage)
    await deleteSession(id);

    // Attempt GitHub sync (best-effort, don't fail if error)
    const gitHubConfig = body?.gitHubConfig as GitHubConfig | undefined;
    if (gitHubConfig && isGitHubConfigured()) {
      try {
        // Create a minimal session object with just the ID for GitHub deletion
        const session: JudoSession = {
          id,
          date: new Date().toISOString().split('T')[0],
          effort: 3,
          category: 'Technical',
          techniques: [],
        };
        await deleteSessionOnGitHub(session, gitHubConfig);
      } catch (error) {
        // Log error but don't fail the request
        console.warn('Failed to sync session deletion to GitHub:', error);
      }
    }

    return NextResponse.json(
      { message: 'Session deleted' },
      { status: 200 }
    );
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
