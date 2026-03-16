import { NextRequest, NextResponse } from 'next/server';
import { findSessionFileById, updateSession, deleteSession } from '@/lib/file-storage';
import { markdownToSession, sessionToMarkdown } from '@/lib/markdown-serializer';
import { promises as fs } from 'fs';
import { JudoSession } from '@/lib/types';

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

    // Find the session file by ID
    const filePath = await findSessionFileById(id);
    if (!filePath) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Read and parse the markdown file
    const markdown = await fs.readFile(filePath, 'utf-8');
    const session = markdownToSession(markdown);

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

    await updateSession(session);

    return NextResponse.json(session, { status: 200 });
  } catch (error) {
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

    await deleteSession(id);

    return NextResponse.json(
      { message: 'Session deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting session', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
