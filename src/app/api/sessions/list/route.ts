import { NextRequest, NextResponse } from 'next/server';
import { BlobStorageDisabledError, listSessions } from '@/lib/vercel-blob-storage';

/**
 * GET /api/sessions/list
 * Returns all sessions from the markdown files, sorted by date (newest first)
 */
export async function GET(request: NextRequest) {
  try {
    const sessions = await listSessions();
    return NextResponse.json(sessions, { status: 200 });
  } catch (error) {
    if (error instanceof BlobStorageDisabledError) {
      return NextResponse.json(
        { error: 'Blob storage disabled' },
        { status: 503 }
      );
    }

    console.error('Error listing sessions', error);
    return NextResponse.json(
      { error: 'Failed to list sessions' },
      { status: 500 }
    );
  }
}
