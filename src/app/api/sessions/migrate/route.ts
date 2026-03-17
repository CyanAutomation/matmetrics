import { NextRequest, NextResponse } from 'next/server';
import {
  acquireMigrationLock,
  BlobStorageDisabledError,
  createSession,
  releaseMigrationLock,
} from '@/lib/vercel-blob-storage';
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
 * Response: {
 *   success: boolean;
 *   migrated: number;
 *   duplicates: number;
 *   invalid: number;
 *   failed: number;
 *   total: number;
 *   errors: string[];
 * }
 */
export async function POST(request: NextRequest) {
  let lockToken: string | null = null;

  try {
    const body = await request.json();

    if (!Array.isArray(body.sessions)) {
      return NextResponse.json(
        { error: 'Invalid request: sessions must be an array' },
        { status: 400 }
      );
    }

    lockToken = await acquireMigrationLock();
    if (!lockToken) {
      return NextResponse.json(
        {
          error: 'A migration is already in progress. Please retry shortly.',
          code: 'MIGRATION_LOCKED',
        },
        { status: 409 }
      );
    }

    const sessions = body.sessions as JudoSession[];
    const errors: string[] = [];
    const seenSessionIds = new Set<string>();

    let migratedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    let failedCount = 0;

    for (const session of sessions) {
      if (!session.id || !session.date || typeof session.effort !== 'number' || !session.category) {
        invalidCount++;
        errors.push('Skipped invalid session: missing required fields');
        continue;
      }

      if (seenSessionIds.has(session.id)) {
        duplicateCount++;
        continue;
      }

      seenSessionIds.add(session.id);

      try {
        await createSession(session);
        migratedCount++;
      } catch (error) {
        if (isBlobStorageDisabledError(error)) {
          throw error;
        }

        failedCount++;
        errors.push(`Failed to migrate session ${session.id}: ${(error as Error).message}`);
      }
    }

    return NextResponse.json(
      {
        success: failedCount === 0,
        migrated: migratedCount,
        duplicates: duplicateCount,
        invalid: invalidCount,
        failed: failedCount,
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
  } finally {
    if (lockToken) {
      await releaseMigrationLock(lockToken);
    }
  }
}
