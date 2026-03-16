import { put, del, list, head } from '@vercel/blob';
import { JudoSession } from './types';
import { markdownToSession, sessionToMarkdown } from './markdown-serializer';

const BLOB_FOLDER = 'sessions';

type BlobStorageDeps = {
  put: typeof put;
  del: typeof del;
  list: typeof list;
  head: typeof head;
  fetch: typeof fetch;
};

let blobStorageDeps: BlobStorageDeps = {
  put,
  del,
  list,
  head,
  fetch,
};

export function __setBlobStorageDepsForTests(overrides: Partial<BlobStorageDeps>): void {
  blobStorageDeps = { ...blobStorageDeps, ...overrides };
}

export function __resetBlobStorageDepsForTests(): void {
  blobStorageDeps = { put, del, list, head, fetch };
}

function sanitizeSessionId(sessionId: string): string {
  if (sessionId.length > 100) {
    throw new Error('Session ID exceeds maximum allowed length of 100 characters');
  }
  return sessionId.replace(/[^a-zA-Z0-9-_]/g, '-');
}

/**
 * Get the blob path for a session based on its date
 * Format: sessions/YYYY/MM/YYYYMMDD-matmetrics.md
 * Preferred format includes session ID: YYYYMMDD-matmetrics-<sessionId>.md
 * Legacy counter format remains supported: YYYYMMDD-matmetrics-01.md
 */
export function getSessionBlobPath(date: string, counter?: number, sessionId?: string): string {
  const [year, month, day] = date.split('-');
  const baseName = sessionId
    ? `${year}${month}${day}-matmetrics-${sanitizeSessionId(sessionId)}.md`
    : `${year}${month}${day}-matmetrics${
        counter !== undefined ? `-${String(counter).padStart(2, '0')}` : ''
      }.md`;
  return `${BLOB_FOLDER}/${year}/${month}/${baseName}`;
}

/**
 * Extract date from a session blob path
 * Reverse of getSessionBlobPath
 */
export function extractDateFromPath(blobPath: string): string | null {
  const match = blobPath.match(/(\d{4})\/(\d{2})\/(\d{8})/);
  if (!match) return null;
  const [, year, month, dayStr] = match;
  if (year.length !== 4 || month.length !== 2 || dayStr.length !== 8) {
    return null;
  }
  const day = dayStr.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Find the next available counter for a given date
 * Used when creating multiple sessions on the same day
 */
export async function getNextCounter(date: string): Promise<number> {
  const [year, month] = date.split('-');
  const prefix = `${BLOB_FOLDER}/${year}/${month}/${date.replace(/-/g, '')}`;

  try {
    const { blobs } = await blobStorageDeps.list({
      prefix,
      limit: 1000,
    });

    const datePrefix = date.replace(/-/g, '');
    let maxCounter = 0;

    for (const blob of blobs) {
      const fileName = blob.pathname.split('/').pop() || '';
      if (!fileName.startsWith(datePrefix)) continue;

      // Try to extract counter from filename
      const counterMatch = fileName.match(
        new RegExp(`${datePrefix}(?:-matmetrics)?(?:-(\\d+))?\\.md`)
      );
      if (counterMatch && counterMatch[1]) {
        maxCounter = Math.max(maxCounter, parseInt(counterMatch[1], 10));
      }
    }

    return maxCounter + 1;
  } catch (e) {
    // Prefix doesn't exist yet, start from 1
    return 1;
  }
}

/**
 * List all sessions from blob storage
 * Returns sessions sorted by date (newest first)
 */
export async function listSessions(): Promise<JudoSession[]> {
  try {
    const sessions: JudoSession[] = [];
    const { blobs } = await blobStorageDeps.list({
      prefix: BLOB_FOLDER,
      limit: 10000, // Adjust if you have more sessions
    });

    for (const blob of blobs) {
      if (!blob.pathname.endsWith('.md')) continue;

      try {
        const response = await blobStorageDeps.fetch(blob.url);
        const markdown = await response.text();
        const session = markdownToSession(markdown);
        sessions.push(session);
      } catch (e) {
        console.error(`Failed to parse session file ${blob.pathname}`, e);
      }
    }

    // Sort by date descending (newest first)
    sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sessions;
  } catch (e) {
    console.error('Error listing sessions from blob storage', e);
    return [];
  }
}

/**
 * Read a single session by date and optional counter
 */
export async function readSession(date: string, counter?: number): Promise<JudoSession | null> {
  try {
    const blobPath = getSessionBlobPath(date, counter);
    const blob = await blobStorageDeps.head(blobPath);

    const response = await blobStorageDeps.fetch(blob.url);
    const markdown = await response.text();
    return markdownToSession(markdown);
  } catch (e) {
    if ((e as any).code === 'BLOB_NOT_FOUND') {
      return null;
    }
    throw e;
  }
}

/**
 * Create a new session file
 * Uses ID-based filenames to avoid counter contention during concurrent writes
 */
export async function createSession(session: JudoSession): Promise<string> {
  if (!session.id || typeof session.id !== 'string') {
    throw new Error('Session ID is required and must be a non-empty string');
  }

  const blobPath = getSessionBlobPath(session.date, undefined, session.id);

  // Idempotency: if a session with this ID already exists, return it as success.
  if (await sessionBlobExists(blobPath)) {
    return blobPath;
  }

  const markdown = sessionToMarkdown(session);

  try {
    await blobStorageDeps.put(blobPath, markdown, {
      contentType: 'text/markdown',
      access: 'public',
      allowOverwrite: false,
    });
    return blobPath;
  } catch (e) {
    if ((e as any).code === 'BLOB_ALREADY_EXISTS') {
      // Another request wrote the same ID concurrently; treat this as idempotent success.
      return blobPath;
    }

    console.error(`Failed to create session at ${blobPath}`, e);
    throw e;
  }
}

export async function sessionBlobExists(blobPath: string): Promise<boolean> {
  try {
    await blobStorageDeps.head(blobPath);
    return true;
  } catch (e) {
    if ((e as any).code === 'BLOB_NOT_FOUND') {
      return false;
    }
    throw e;
  }
}

/**
 * Update an existing session by finding it by ID
 * Returns the blob path where it was written
 */
export async function updateSession(session: JudoSession): Promise<string> {
  // Find the session by ID
  const blobPath = await findSessionFileById(session.id);
  if (!blobPath) {
    throw new Error(`Session with ID ${session.id} not found`);
  }

  const markdown = sessionToMarkdown(session);

  try {
    await blobStorageDeps.put(blobPath, markdown, {
      contentType: 'text/markdown',
      access: 'public',
    });
    return blobPath;
  } catch (e) {
    console.error(`Failed to update session at ${blobPath}`, e);
    throw e;
  }
}

/**
 * Delete a session by ID
 */
export async function deleteSession(id: string): Promise<void> {
  const blobPath = await findSessionFileById(id);
  if (!blobPath) {
    throw new Error(`Session with ID ${id} not found`);
  }

  try {
    await blobStorageDeps.del(blobPath);
  } catch (e) {
    console.error(`Failed to delete session at ${blobPath}`, e);
    throw e;
  }
}

/**
 * Find the blob path of a session by its ID
 * Returns null if not found
 */
export async function findSessionFileById(id: string): Promise<string | null> {
  try {
    const sanitizedId = sanitizeSessionId(id);
    const suffix = `-${sanitizedId}.md`;

    try {
      const { blobs } = await blobStorageDeps.list({
        prefix: `${BLOB_FOLDER}/`,
        limit: 10000,
      });

      const directMatch = blobs.find(blob => blob.pathname.endsWith(suffix));
      if (directMatch) {
        return directMatch.pathname;
      }

      for (const blob of blobs) {
        if (!blob.pathname.endsWith('.md')) continue;

        try {
          const response = await blobStorageDeps.fetch(blob.url);
          const markdown = await response.text();
          const parsedSession = markdownToSession(markdown);
          if (parsedSession.id === id) {
            return blob.pathname;
          }
        } catch (e) {
          // Skip files that can't be parsed
        }
      }
    } catch (e) {
      console.error(`Error listing blobs with prefix ${BLOB_FOLDER}/`, e);
    }

    return null;
  } catch (e) {
    console.error('Error finding session by ID', e);
    return null;
  }
}

/**
 * Check if there are any sessions in blob storage
 * Useful for determining if migration is needed
 */
export async function hasAnySessions(): Promise<boolean> {
  try {
    const { blobs } = await blobStorageDeps.list({
      prefix: BLOB_FOLDER,
      limit: 1,
    });
    return blobs.length > 0;
  } catch (e) {
    console.error('Error checking for sessions', e);
    return false;
  }
}
