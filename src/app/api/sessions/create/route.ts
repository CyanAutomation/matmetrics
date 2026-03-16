import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/file-storage';
import { JudoSession } from '@/lib/types';

/**
 * POST /api/sessions/create
 * Create a new session and save it as a markdown file
 * 
 * Request body: Partial JudoSession (id will be generated if not provided)
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

    await createSession(session);

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('Error creating session', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
