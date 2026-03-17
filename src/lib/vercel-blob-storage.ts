import { put, del, list, head } from '@vercel/blob';
import { JudoSession } from './types';
import { markdownToSession, sessionToMarkdown } from './markdown-serializer';

const BLOB_FOLDER = 'sessions';
const SESSION_ID_INDEX_PATH = `${BLOB_FOLDER}/_index/session-id-paths.json`;
const MIGRATION_LOCK_PATH = `${BLOB_FOLDER}/_locks/migration.lock`;

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

let sessionPathIndexCache: Record<string, string> | null = null;
let sessionPathIndexMutationQueue: Promise<void> = Promise.resolve();

function withSessionPathIndexMutationLock<T>(
  operation: () => Promise<T>
): Promise<T> {
  const runOperation = sessionPathIndexMutationQueue.then(operation, operation);
  sessionPathIndexMutationQueue = runOperation.then(
    () => undefined,
    () => undefined
  );
  return runOperation;
}

export class BlobStorageDisabledError extends Error {
  readonly code = 'BLOB_STORAGE_DISABLED';

  constructor(message = 'Vercel Blob storage is disabled') {
    super(message);
    this.name = 'BlobStorageDisabledError';
  }
}

export class SessionLookupError extends Error {
  readonly kind: 'not_found' | 'storage_error';

  constructor(kind: 'not_found' | 'storage_error', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SessionLookupError';
    this.kind = kind;
  }
}

function isBlobNotFoundError(error: unknown): boolean {
  return (error as any)?.code === 'BLOB_NOT_FOUND';
}

export function isBlobStorageEnabled(): boolean {
  const rawValue = process.env.ENABLE_VERCEL_BLOB;
  if (!rawValue) {
    return true;
  }

  return !['0', 'false', 'off', 'no'].includes(rawValue.trim().toLowerCase());
}

function assertBlobStorageEnabled(): void {
  if (!isBlobStorageEnabled()) {
    throw new BlobStorageDisabledError();
  }
}

export function __setBlobStorageDepsForTests(overrides: Partial<BlobStorageDeps>): void {
  blobStorageDeps = { ...blobStorageDeps, ...overrides };
}

export function __resetBlobStorageDepsForTests(): void {
  blobStorageDeps = { put, del, list, head, fetch };
  sessionPathIndexCache = null;
  sessionPathIndexMutationQueue = Promise.resolve();
}

async function loadSessionPathIndex(): Promise<Record<string, string>> {
  if (sessionPathIndexCache) {
    return sessionPathIndexCache;
  }

  try {
    const blob = await blobStorageDeps.head(SESSION_ID_INDEX_PATH);
    const response = await blobStorageDeps.fetch(blob.url);
    if (!response.ok) {
      sessionPathIndexCache = {};
      return sessionPathIndexCache;
    }

    const indexText = await response.text();
    try {
      const parsed = JSON.parse(indexText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        sessionPathIndexCache = Object.fromEntries(
          Object.entries(parsed).filter(
            ([key, value]) => typeof key === 'string' && typeof value === 'string'
          )
        );
        return sessionPathIndexCache;
      }
    } catch (parseError) {
      console.error('Failed parsing session path index JSON', parseError);
    }
  } catch (e) {
    if ((e as any).code !== 'BLOB_NOT_FOUND') {
      console.error('Failed loading session path index', e);
    }
  }

  sessionPathIndexCache = {};
  return sessionPathIndexCache;
}

async function persistSessionPathIndex(index: Record<string, string>): Promise<void> {
  const previousCache = sessionPathIndexCache;
  sessionPathIndexCache = { ...index };

  try {
    await blobStorageDeps.put(SESSION_ID_INDEX_PATH, JSON.stringify(index), {
      contentType: 'application/json',
      access: 'private',
      allowOverwrite: true,
    });
  } catch (e) {
    sessionPathIndexCache = previousCache;
    console.error('Failed persisting session path index', e);
    throw e;
  }
}

async function setSessionPathIndexEntry(id: string, pathname: string): Promise<void> {
  await withSessionPathIndexMutationLock(async () => {
    const index = await loadSessionPathIndex();
    if (index[id] === pathname) {
      return;
    }

    await persistSessionPathIndex({ ...index, [id]: pathname });
  });
}

async function removeSessionPathIndexEntry(id: string): Promise<void> {
  await withSessionPathIndexMutationLock(async () => {
    const index = await loadSessionPathIndex();
    if (!(id in index)) {
      return;
    }

    const { [id]: _removed, ...rest } = index;
    await persistSessionPathIndex(rest);
  });
}

function validateSessionIdLength(sessionId: string): void {
  if (sessionId.length > 100) {
    throw new Error('Session ID exceeds maximum allowed length of 100 characters');
  }
}

function encodeSessionId(sessionId: string): string {
  validateSessionIdLength(sessionId);
  return encodeURIComponent(sessionId);
}

function sanitizeSessionIdLegacy(sessionId: string): string {
  validateSessionIdLength(sessionId);
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
    ? `${year}${month}${day}-matmetrics-${encodeSessionId(sessionId)}.md`
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
  assertBlobStorageEnabled();

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
  assertBlobStorageEnabled();

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
}

/**
 * Read a single session by date and optional counter
 */
export async function readSession(date: string, counter?: number): Promise<JudoSession | null> {
  assertBlobStorageEnabled();

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
 * Read and parse a session directly from a known blob path.
 * Throws SessionLookupError(not_found) when the blob is missing and
 * SessionLookupError(storage_error) for fetch/parse failures.
 */
export async function readSessionByPath(blobPath: string): Promise<JudoSession> {
  assertBlobStorageEnabled();

  try {
    const blob = await blobStorageDeps.head(blobPath);
    const response = await blobStorageDeps.fetch(blob.url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new SessionLookupError('not_found', `Session blob not found at ${blobPath}`);
      }

      throw new SessionLookupError(
        'storage_error',
        `Failed fetching session blob at ${blobPath} (status ${response.status})`
      );
    }

    const markdown = await response.text();
    return markdownToSession(markdown);
  } catch (e) {
    if (e instanceof SessionLookupError) {
      throw e;
    }

    if (isBlobNotFoundError(e)) {
      throw new SessionLookupError('not_found', `Session blob not found at ${blobPath}`, {
        cause: e,
      });
    }

    throw new SessionLookupError('storage_error', `Failed reading session blob at ${blobPath}`, {
      cause: e,
    });
  }
}

/**
 * Read and parse one session by ID.
 */
export async function readSessionById(id: string): Promise<JudoSession> {
  assertBlobStorageEnabled();

  const blobPath = await findSessionFileById(id);
  if (!blobPath) {
    throw new SessionLookupError('not_found', `Session with ID ${id} not found`);
  }

  return readSessionByPath(blobPath);
}

/**
 * Create a new session file
 * Uses ID-based filenames to avoid counter contention during concurrent writes
 */
export async function createSession(session: JudoSession): Promise<string> {
  assertBlobStorageEnabled();

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
  } catch (e) {
    if ((e as any).code === 'BLOB_ALREADY_EXISTS') {
      // Another request wrote the same ID concurrently; treat this as idempotent success.
    } else {
      console.error(`Failed to create session at ${blobPath}`, e);
      throw e;
    }
  }

  await setSessionPathIndexEntry(session.id, blobPath);
  return blobPath;
}

export async function sessionBlobExists(blobPath: string): Promise<boolean> {
  assertBlobStorageEnabled();

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
  assertBlobStorageEnabled();

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
    await setSessionPathIndexEntry(session.id, blobPath);
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
  assertBlobStorageEnabled();

  const blobPath = await findSessionFileById(id);
  if (!blobPath) {
    throw new Error(`Session with ID ${id} not found`);
  }

  try {
    await blobStorageDeps.del(blobPath);
    await removeSessionPathIndexEntry(id);
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
  assertBlobStorageEnabled();
  const encodedSuffix = `-${encodeSessionId(id)}.md`;
  const legacySuffix = `-${sanitizeSessionIdLegacy(id)}.md`;

  const index = await loadSessionPathIndex();
  const indexedPath = index[id];
  if (indexedPath) {
    try {
      await blobStorageDeps.head(indexedPath);
      return indexedPath;
    } catch (e) {
      if (isBlobNotFoundError(e)) {
        try {
          await withSessionPathIndexMutationLock(async () => {
            const latestIndex = await loadSessionPathIndex();
            if (!(id in latestIndex)) {
              return;
            }

            const { [id]: _removed, ...rest } = latestIndex;
            await persistSessionPathIndex(rest);
          });
        } catch (persistError) {
          console.error(`Failed removing stale indexed path for session ${id}`, persistError);
        }
      } else {
        throw new SessionLookupError(
          'storage_error',
          `Failed validating indexed blob path for session ${id}`,
          { cause: e }
        );
      }
    }
  }

  let blobs: Array<{ pathname: string; url: string }> = [];
  try {
    const listed = await blobStorageDeps.list({
      prefix: `${BLOB_FOLDER}/`,
      limit: 10000,
    });
    blobs = listed.blobs;
  } catch (e) {
    throw new SessionLookupError('storage_error', `Failed listing session blobs for ${id}`, {
      cause: e,
    });
  }

  const directMatch = blobs.find(
    blob => blob.pathname.endsWith(encodedSuffix) || blob.pathname.endsWith(legacySuffix)
  );
  if (directMatch) {
    try {
      await setSessionPathIndexEntry(id, directMatch.pathname);
    } catch (indexError) {
      console.error(`Failed caching indexed path for session ${id}`, indexError);
    }
    return directMatch.pathname;
  }

  for (const blob of blobs) {
    if (!blob.pathname.endsWith('.md')) continue;

    let markdown: string;
    try {
      const response = await blobStorageDeps.fetch(blob.url);
      if (!response.ok) {
        if (response.status === 404) {
          continue;
        }

        throw new SessionLookupError(
          'storage_error',
          `Failed fetching blob ${blob.pathname} while looking up session ${id}`
        );
      }
      markdown = await response.text();
    } catch (e) {
      if (e instanceof SessionLookupError) {
        throw e;
      }

      throw new SessionLookupError(
        'storage_error',
        `Failed fetching blob ${blob.pathname} while looking up session ${id}`,
        { cause: e }
      );
    }

    try {
      const parsedSession = markdownToSession(markdown);
      if (parsedSession.id === id) {
        try {
          await setSessionPathIndexEntry(id, blob.pathname);
        } catch (indexError) {
          console.error(`Failed caching indexed path for session ${id}`, indexError);
        }
        return blob.pathname;
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  return null;
}

/**
 * Check if there are any sessions in blob storage
 * Useful for determining if migration is needed
 */
export async function hasAnySessions(): Promise<boolean> {
  assertBlobStorageEnabled();

  try {
    let cursor: string | undefined;

    do {
      const result = (await blobStorageDeps.list({
        prefix: `${BLOB_FOLDER}/`,
        limit: 1,
        cursor,
      } as any)) as {
        blobs: Array<{ pathname: string }>;
        cursor?: string;
        hasMore?: boolean;
      };

      const hasSessionBlob = result.blobs.some(
        blob =>
          blob.pathname.endsWith('.md') &&
          !blob.pathname.startsWith(`${BLOB_FOLDER}/_index/`) &&
          !blob.pathname.startsWith(`${BLOB_FOLDER}/_locks/`)
      );

      if (hasSessionBlob) {
        return true;
      }

      cursor = result.cursor;

      if (!result.hasMore || !result.cursor) {
        break;
      }
    } while (cursor);

    return false;
  } catch (e) {
    console.error('Error checking for sessions', e);
    return false;
  }
}

export async function acquireMigrationLock(ttlMs = 30000): Promise<string | null> {
  assertBlobStorageEnabled();

  const lockToken = `${Date.now()}-${crypto.randomUUID()}`;

  const writeLock = async (now: number) => {
    await blobStorageDeps.put(
      MIGRATION_LOCK_PATH,
      JSON.stringify({ token: lockToken, expiresAt: now + ttlMs }),
      {
        contentType: 'application/json',
        access: 'private',
        allowOverwrite: false,
      }
    );
  };

  const lockIsActive = async (now: number): Promise<boolean> => {
    try {
      const existingLock = await blobStorageDeps.head(MIGRATION_LOCK_PATH);
      const response = await blobStorageDeps.fetch(existingLock.url);
      if (!response.ok) {
        return false;
      }

      const payload = (await response.json()) as { expiresAt?: number };
      return typeof payload.expiresAt === 'number' && payload.expiresAt > now;
    } catch (e) {
      if ((e as any).code !== 'BLOB_NOT_FOUND') {
        console.error('Failed reading migration lock metadata', e);
      }
      return false;
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const now = Date.now();

    try {
      await writeLock(now);
      return lockToken;
    } catch (e) {
      if ((e as any).code !== 'BLOB_ALREADY_EXISTS') {
        throw e;
      }
    }

    if (await lockIsActive(now)) {
      return null;
    }

    try {
      await blobStorageDeps.del(MIGRATION_LOCK_PATH);
    } catch (e) {
      if ((e as any).code !== 'BLOB_NOT_FOUND') {
        return null;
      }
    }
  }

  return null;
}

export async function releaseMigrationLock(lockToken: string): Promise<void> {
  assertBlobStorageEnabled();

  try {
    const existingLock = await blobStorageDeps.head(MIGRATION_LOCK_PATH);
    const response = await blobStorageDeps.fetch(existingLock.url);
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { token?: string };
    if (payload.token !== lockToken) {
      return;
    }

    await blobStorageDeps.del(MIGRATION_LOCK_PATH);
  } catch (e) {
    if ((e as any).code === 'BLOB_NOT_FOUND') {
      return;
    }
    console.error('Failed releasing migration lock', e);
  }
}
