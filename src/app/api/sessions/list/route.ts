import { NextRequest, NextResponse } from 'next/server';
import { listSessions } from '@/lib/file-storage';

/**
 * GET /api/sessions/list
 * Returns all sessions from the markdown files, sorted by date (newest first)
 */
export async function GET(request: NextRequest) {
  try {
    const sessions = await listSessions();
    return NextResponse.json(sessions, { status: 200 });
  } catch (error) {
    console.error('Error listing sessions', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
