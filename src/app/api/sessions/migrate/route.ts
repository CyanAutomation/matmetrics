import { NextRequest, NextResponse } from 'next/server';
import { BlobStorageDisabledError, createSession, hasAnySessions } from '@/lib/vercel-blob-storage';
import { JudoSession } from '@/lib/types';

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
 * POST /api/sessions/migrate
 * Migrate sessions from localStorage to markdown files
 * 
 * Request body: { sessions: JudoSession[] }
 * Response: { success: boolean; migrated: number; errors: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    // Check if markdown files already exist
    const hasExisting = await hasAnySessions();
    if (hasExisting) {
      return NextResponse.json(
        { error: 'Markdown files already exist. Migration cancelled to prevent data loss.' },
        { status: 400 }
      );
    }

    const body = await request.json();

    if (!Array.isArray(body.sessions)) {
      return NextResponse.json(
        { error: 'Invalid request: sessions must be an array' },
        { status: 400 }
      );
    }

    const sessions = body.sessions as JudoSession[];
    const errors: string[] = [];
    let migratedCount = 0;

    // Migrate each session
    for (const session of sessions) {
      try {
        // Ensure session has all required fields
        if (!session.id || !session.date || typeof session.effort !== 'number' || !session.category) {
          errors.push(`Skipped invalid session: missing required fields`);
          continue;
        }

        await createSession(session);
        migratedCount++;
      } catch (error) {
        if (isBlobStorageDisabledError(error)) {
          throw error;
        }

        errors.push(`Failed to migrate session ${session.id}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json(
      {
        success: errors.length === 0,
        migrated: migratedCount,
        total: sessions.length,
        errors,
      },
      { status: 200 }
    );
  } catch (error) {
    if (isBlobStorageDisabledError(error)) {
      return blobStorageDisabledResponse();
    }

    console.error('Error during migration', error);
    return NextResponse.json(
      { error: 'Failed to migrate sessions' },
      { status: 500 }
    );
  }
}
