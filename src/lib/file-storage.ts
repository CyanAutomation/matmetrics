import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { JudoSession } from './types';
import { markdownToSession, sessionToMarkdown } from './markdown-serializer';
import { compareDateOnlyDesc } from './utils';

let dataDir = path.join(process.cwd(), 'data');
const SESSION_INDEX_DIR = '.index';
const SESSION_INDEX_RESOLVE_TIMEOUT_MS = 3000;
const SESSION_INDEX_INITIAL_BACKOFF_MS = 10;
const SESSION_INDEX_MAX_BACKOFF_MS = 250;
const YEAR_DIR_PATTERN = /^\d{4}$/;
const MONTH_DIR_PATTERN = /^(0[1-9]|1[0-2])$/;

interface SessionIndexRecord {
  id: string;
  path: string;
  status?: 'locking' | 'ready';
  updatedAt?: number;
  lockAcquiredAt?: number;
}

export class DuplicateSessionIdError extends Error {
  readonly code = 'DUPLICATE_SESSION_ID';
  readonly sessionId: string;
  readonly paths: string[];

  constructor(sessionId: string, paths: string[]) {
    const sortedPaths = [...paths].sort();
    super(
      `Duplicate session ID ${sessionId} found in multiple files: ${sortedPaths.join(
        ', '
      )}`
    );
    this.name = 'DuplicateSessionIdError';
    this.sessionId = sessionId;
    this.paths = sortedPaths;
  }
}

export function isDuplicateSessionIdError(
  error: unknown
): error is DuplicateSessionIdError {
  return error instanceof DuplicateSessionIdError;
}

export class SessionUpdateConflictError extends Error {
  readonly code = 'SESSION_UPDATE_CONFLICT';
  readonly sessionId: string;
  readonly sessionPath: string;

  constructor(sessionId: string, sessionPath: string) {
    super(
      `Session ${sessionId} was modified concurrently at ${sessionPath}; refusing to overwrite newer content`
    );
    this.name = 'SessionUpdateConflictError';
    this.sessionId = sessionId;
    this.sessionPath = sessionPath;
  }
}

export function isSessionUpdateConflictError(
  error: unknown
): error is SessionUpdateConflictError {
  return error instanceof SessionUpdateConflictError;
}

function getDataDir(): string {
  return dataDir;
}

export function __setDataDirForTests(nextDataDir: string): void {
  if (!nextDataDir || typeof nextDataDir !== 'string') {
    throw new Error('Data directory must be a non-empty string');
  }
  dataDir = path.resolve(nextDataDir);
}

export function __resetDataDirForTests(): void {
  dataDir = path.resolve(process.cwd(), 'data');
}

function sanitizeSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Session ID is required and must be a non-empty string');
  }
  if (sessionId.length > 100) {
    throw new Error(
      'Session ID exceeds maximum allowed length of 100 characters'
    );
  }
  // Enforce a strict allow-list to ensure the ID cannot affect directory structure.
  // Only ASCII letters, digits, dash, and underscore are permitted.
  const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
  if (!SAFE_ID_PATTERN.test(sessionId)) {
    throw new Error(
      'Session ID contains invalid characters; only letters, digits, "-" and "_" are allowed'
    );
  }
  return sessionId;
}

function isPathWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function ensureResolvedPathWithinDataDir(filePath: string): string {
  const root = path.resolve(getDataDir());
  const resolved = path.resolve(filePath);

  if (!isPathWithinRoot(root, resolved)) {
    throw new Error('Resolved session file path escapes data directory');
  }

  return resolved;
}

async function getRealDataDirRoot(): Promise<string> {
  const root = path.resolve(getDataDir());
  try {
    return await fs.realpath(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return root;
    }
    throw error;
  }
}

async function ensureExistingPathWithinDataDir(filePath: string): Promise<string> {
  const resolved = ensureResolvedPathWithinDataDir(filePath);
  const realRoot = await getRealDataDirRoot();
  const realPath = await fs.realpath(resolved);

  if (!isPathWithinRoot(realRoot, realPath)) {
    throw new Error('Resolved session file path escapes data directory');
  }

  return resolved;
}

async function findClosestExistingAncestor(targetPath: string): Promise<string> {
  let currentPath = path.resolve(targetPath);

  while (true) {
    try {
      await fs.lstat(currentPath);
      return currentPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return currentPath;
    }
    currentPath = parentPath;
  }
}

async function ensureCreatablePathWithinDataDir(filePath: string): Promise<string> {
  const resolved = ensureResolvedPathWithinDataDir(filePath);
  const realRoot = await getRealDataDirRoot();
  const existingAncestor = await findClosestExistingAncestor(path.dirname(resolved));
  const realAncestor = await fs.realpath(existingAncestor);

  if (!isPathWithinRoot(realRoot, realAncestor)) {
    throw new Error('Resolved session file path escapes data directory');
  }

  return resolved;
}

async function ensureNonSymlinkDirectory(dirPath: string): Promise<string> {
  const resolved = await ensureExistingPathWithinDataDir(dirPath);
  const stats = await fs.lstat(resolved);

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Unsafe session directory: ${resolved}`);
  }

  return resolved;
}

function getSessionIndexDirPath(): string {
  return ensureResolvedPathWithinDataDir(
    path.join(getDataDir(), SESSION_INDEX_DIR)
  );
}

function isSessionIndexDirName(name: string): boolean {
  return name === SESSION_INDEX_DIR;
}

function isYearDirName(name: string): boolean {
  return YEAR_DIR_PATTERN.test(name);
}

function isMonthDirName(name: string): boolean {
  return MONTH_DIR_PATTERN.test(name);
}

function getSessionIndexFilePath(sessionId: string): string {
  return ensureResolvedPathWithinDataDir(
    path.join(getSessionIndexDirPath(), `${sanitizeSessionId(sessionId)}.json`)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getTempPathForTarget(targetPath: string): string {
  return ensureResolvedPathWithinDataDir(
    `${targetPath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`
  );
}

function getSessionUpdateLockPath(targetPath: string): string {
  return ensureResolvedPathWithinDataDir(`${targetPath}.lock`);
}

async function releaseSessionUpdateLock(lockPath: string): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.unlink(lockPath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return;
      }
      const isFinalAttempt = attempt === maxAttempts;
      if (!isFinalAttempt && (code === 'EPERM' || code === 'EBUSY')) {
        await sleep(10);
        continue;
      }
      throw error;
    }
  }
}

async function acquireSessionUpdateLock(
  sessionId: string,
  targetPath: string
): Promise<() => Promise<void>> {
  const lockPath = getSessionUpdateLockPath(targetPath);
  await ensureCreatablePathWithinDataDir(lockPath);

  try {
    await fs.writeFile(lockPath, `${process.pid}\n`, {
      encoding: 'utf-8',
      flag: 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new SessionUpdateConflictError(sessionId, targetPath);
    }
    throw error;
  }

  return async () => {
    await releaseSessionUpdateLock(lockPath);
  };
}

async function readSessionIndex(
  sessionId: string
): Promise<SessionIndexRecord | null> {
  const indexPath = getSessionIndexFilePath(sessionId);
  try {
    const safeIndexPath = await ensureExistingPathWithinDataDir(indexPath);
    const raw = await fs.readFile(safeIndexPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SessionIndexRecord>;
    if (
      parsed &&
      parsed.id === sessionId &&
      typeof parsed.path === 'string' &&
      parsed.path.length > 0
    ) {
      return {
        id: parsed.id,
        path: await ensureExistingPathWithinDataDir(parsed.path),
        status:
          parsed.status === 'locking' || parsed.status === 'ready'
            ? parsed.status
            : undefined,
        updatedAt:
          typeof parsed.updatedAt === 'number' ? parsed.updatedAt : undefined,
        lockAcquiredAt:
          typeof parsed.lockAcquiredAt === 'number'
            ? parsed.lockAcquiredAt
            : undefined,
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Failed to read session index for ${sessionId}`, error);
    }
  }
  return null;
}

async function writeSessionIndex(
  sessionId: string,
  sessionPath: string,
  flag: 'wx' | 'w',
  metadata?: Pick<SessionIndexRecord, 'status' | 'updatedAt' | 'lockAcquiredAt'>
): Promise<void> {
  const record: SessionIndexRecord = {
    id: sessionId,
    path: ensureResolvedPathWithinDataDir(sessionPath),
    ...metadata,
  };
  const indexPath = getSessionIndexFilePath(sessionId);
  await ensureCreatablePathWithinDataDir(indexPath);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(record), {
    encoding: 'utf-8',
    flag,
  });
}

interface ResolveIndexedSessionPathResult {
  path: string | null;
  lastRecord: SessionIndexRecord | null;
}

async function resolveIndexedSessionPath(
  sessionId: string
): Promise<ResolveIndexedSessionPathResult> {
  const deadline = Date.now() + SESSION_INDEX_RESOLVE_TIMEOUT_MS;
  let backoffMs = SESSION_INDEX_INITIAL_BACKOFF_MS;
  let lastRecord: SessionIndexRecord | null = null;

  while (Date.now() <= deadline) {
    const indexed = await readSessionIndex(sessionId);
    lastRecord = indexed;
    if (indexed) {
      try {
        await fs.access(await ensureExistingPathWithinDataDir(indexed.path));
        return {
          path: indexed.path,
          lastRecord: indexed,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(backoffMs, remainingMs));
    backoffMs = Math.min(backoffMs * 2, SESSION_INDEX_MAX_BACKOFF_MS);
  }

  return {
    path: null,
    lastRecord,
  };
}

function validateAndNormalizeDate(date: string): string {
  // Expect strict YYYY-MM-DD format
  const ISO_DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error('Invalid session date format; expected YYYY-MM-DD');
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    throw new Error('Invalid session date value');
  }
  // Return normalized date string to ensure consistent formatting
  const normalizedYear = String(year).padStart(4, '0');
  const normalizedMonth = String(month).padStart(2, '0');
  const normalizedDay = String(day).padStart(2, '0');
  return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`;
}

/**
 * Get the file path for a session based on its date
 * Format: data/YYYY/MM/YYYYMMDD-matmetrics.md
 * Preferred format includes session ID: YYYYMMDD-matmetrics-<sessionId>.md
 * Legacy counter format remains supported: YYYYMMDD-matmetrics-01.md
 */
export function getSessionFilePath(
  date: string,
  counter?: number,
  sessionId?: string
): string {
  const normalizedDate = validateAndNormalizeDate(date);
  const [year, month, day] = normalizedDate.split('-');
  const baseName = sessionId
    ? `${year}${month}${day}-matmetrics-${sanitizeSessionId(sessionId)}.md`
    : `${year}${month}${day}-matmetrics${
        counter !== undefined ? `-${String(counter).padStart(2, '0')}` : ''
      }.md`;
  return ensureResolvedPathWithinDataDir(
    path.join(getDataDir(), year, month, baseName)
  );
}

/**
 * Extract date from a session file path
 * Reverse of getSessionFilePath
 */
export function extractDateFromPath(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const [, year, month, dayMatch] =
    normalizedPath.match(/(?:^|\/)(\d{4})\/(\d{2})\/(\d{8})(?=[^0-9]|$)/) || [];
  if (!dayMatch) return null;
  const day = dayMatch.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Find the next available counter for a given date
 * Used when creating multiple sessions on the same day
 */
export async function getNextCounter(date: string): Promise<number> {
  const normalizedDate = validateAndNormalizeDate(date);
  const [year, month] = normalizedDate.split('-');
  const dirPath = ensureResolvedPathWithinDataDir(
    path.join(getDataDir(), year, month)
  );

  try {
    const files = await fs.readdir(await ensureNonSymlinkDirectory(dirPath));
    const datePrefix = normalizedDate.replace(/-/g, '');

    let maxCounter = 0;
    for (const file of files) {
      if (!file.startsWith(datePrefix)) continue;

      // Try to extract counter from filename
      const counterMatch = file.match(
        new RegExp(`${datePrefix}(?:-matmetrics)?(?:-(\\d+))?\\.md`)
      );
      if (counterMatch && counterMatch[1]) {
        maxCounter = Math.max(maxCounter, parseInt(counterMatch[1], 10));
      }
    }

    return maxCounter + 1;
  } catch {
    // Directory doesn't exist yet, start from 1
    return 1;
  }
}

/**
 * List all sessions from the data directory
 * Returns sessions sorted by date (newest first)
 */
export async function listSessions(): Promise<JudoSession[]> {
  try {
    const sessions: JudoSession[] = [];
    const rootDir = getDataDir();
    const years = await fs.readdir(rootDir);

    for (const year of years) {
      if (isSessionIndexDirName(year) || !isYearDirName(year)) continue;
      const yearPath = path.join(rootDir, year);
      let safeYearPath: string;
      try {
        safeYearPath = await ensureNonSymlinkDirectory(yearPath);
      } catch {
        continue;
      }

      const months = await fs.readdir(safeYearPath);

      for (const month of months) {
        if (!isMonthDirName(month)) continue;
        const monthPath = path.join(safeYearPath, month);
        let safeMonthPath: string;
        try {
          safeMonthPath = await ensureNonSymlinkDirectory(monthPath);
        } catch {
          continue;
        }

        const files = await fs.readdir(safeMonthPath);

        for (const file of files) {
          if (!file.endsWith('.md')) continue;

          try {
            const filePath = await ensureExistingPathWithinDataDir(
              path.join(safeMonthPath, file)
            );
            const markdown = await fs.readFile(filePath, 'utf-8');
            const session = markdownToSession(markdown);
            sessions.push(session);
          } catch (e) {
            console.error(`Failed to parse session file ${file}`, e);
          }
        }
      }
    }

    // Sort by date descending (newest first)
    sessions.sort((a, b) => compareDateOnlyDesc(a.date, b.date));
    return sessions;
  } catch (e) {
    // Data directory doesn't exist yet
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw e;
  }
}

/**
 * Read a single session by date and optional counter
 */
export async function readSession(
  date: string,
  counter?: number
): Promise<JudoSession | null> {
  try {
    const filePath = getSessionFilePath(date, counter);
    const markdown = await fs.readFile(
      await ensureExistingPathWithinDataDir(filePath),
      'utf-8'
    );
    return markdownToSession(markdown);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
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
  const normalizedDate = validateAndNormalizeDate(session.date);
  const [year, month] = normalizedDate.split('-');
  const dirPath = ensureResolvedPathWithinDataDir(
    path.join(getDataDir(), year, month)
  );

  // Ensure directory exists
  await ensureCreatablePathWithinDataDir(dirPath);
  await fs.mkdir(dirPath, { recursive: true });

  const markdown = sessionToMarkdown(session);

  // Prefer ID-based filenames to avoid counter contention in concurrent creates.
  if (!session.id || typeof session.id !== 'string') {
    throw new Error('Session ID is required and must be a non-empty string');
  }
  const filePath = getSessionFilePath(normalizedDate, undefined, session.id);
  const indexPath = getSessionIndexFilePath(session.id);
  const assertExistingSessionMatches = async (
    existingPath: string
  ): Promise<string> => {
    const safeExistingPath = await ensureExistingPathWithinDataDir(existingPath);
    const existingMarkdown = await fs.readFile(safeExistingPath, 'utf-8');
    if (existingMarkdown !== markdown) {
      throw new Error(
        `Session ID ${session.id} already exists with different content; refusing to overwrite existing data`
      );
    }
    return safeExistingPath;
  };
  let hasIndexLock = false;
  const lockAcquiredAt = Date.now();

  try {
    await writeSessionIndex(session.id, filePath, 'wx', {
      status: 'locking',
      lockAcquiredAt,
      updatedAt: lockAcquiredAt,
    });
    hasIndexLock = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    const { path: indexedExistingPath, lastRecord } =
      await resolveIndexedSessionPath(session.id);
    if (!indexedExistingPath) {
      const lockAgeMs =
        lastRecord?.lockAcquiredAt !== undefined
          ? Date.now() - lastRecord.lockAcquiredAt
          : null;
      const lockStateDescription =
        lockAgeMs !== null
          ? `could not be resolved after ${SESSION_INDEX_RESOLVE_TIMEOUT_MS}ms (observed lock age ${lockAgeMs}ms)`
          : `could not be resolved after ${SESSION_INDEX_RESOLVE_TIMEOUT_MS}ms`;
      throw new Error(
        `Session ID ${session.id} is locked by another create operation and ${lockStateDescription}`
      );
    }
    return await assertExistingSessionMatches(indexedExistingPath);
  }

  try {
    await ensureCreatablePathWithinDataDir(filePath);
    await fs.writeFile(filePath, markdown, {
      encoding: 'utf-8',
      flag: 'wx',
    });
    await writeSessionIndex(session.id, filePath, 'w', {
      status: 'ready',
      lockAcquiredAt,
      updatedAt: Date.now(),
    });
    return filePath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const { path: concurrentExistingPath } = await resolveIndexedSessionPath(
        session.id
      );
      if (concurrentExistingPath) {
        return await assertExistingSessionMatches(concurrentExistingPath);
      }
      throw new Error(
        `Session ID ${session.id} was created concurrently but could not be validated safely`
      );
    }
    throw error;
  } finally {
    if (hasIndexLock) {
      try {
        const verifyMarkdown = await fs.readFile(filePath, 'utf-8');
        if (verifyMarkdown !== markdown) {
          await fs.unlink(indexPath).catch(() => undefined);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await fs.unlink(indexPath).catch(() => undefined);
        }
      }
    }
  }
}

async function updateSessionIndexPath(
  id: string,
  sessionPath: string
): Promise<void> {
  try {
    await writeSessionIndex(id, sessionPath, 'w');
  } catch (error) {
    console.warn(`Failed to update session index for ${id}`, error);
  }
}

async function removeSessionIndex(id: string): Promise<void> {
  const indexPath = getSessionIndexFilePath(id);
  try {
    await fs.unlink(await ensureExistingPathWithinDataDir(indexPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Update an existing session by finding it by ID
 * Returns the file path where it was written
 */
export async function updateSession(session: JudoSession): Promise<string> {
  // Find the session by ID
  const existingPath = await findSessionFileById(session.id);
  if (!existingPath) {
    throw new Error(`Session with ID ${session.id} not found`);
  }
  await ensureExistingPathWithinDataDir(existingPath);

  const nextPath = getSessionFilePath(session.date, undefined, session.id);
  const markdown = sessionToMarkdown(session);

  if (existingPath === nextPath) {
    const releaseLock = await acquireSessionUpdateLock(
      session.id,
      existingPath
    );
    try {
      const priorMarkdown = await fs.readFile(
        await ensureExistingPathWithinDataDir(existingPath),
        'utf-8'
      );
      const tempPath = getTempPathForTarget(existingPath);

      await ensureCreatablePathWithinDataDir(tempPath);
      await fs.writeFile(tempPath, markdown, { encoding: 'utf-8', flag: 'wx' });
      try {
        const currentMarkdown = await fs.readFile(
          await ensureExistingPathWithinDataDir(existingPath),
          'utf-8'
        );
        if (currentMarkdown !== priorMarkdown) {
          throw new SessionUpdateConflictError(session.id, existingPath);
        }
        await ensureCreatablePathWithinDataDir(existingPath);
        await fs.rename(tempPath, existingPath);
      } finally {
        await fs.unlink(tempPath).catch(() => undefined);
      }
    } finally {
      await releaseLock();
    }
    await updateSessionIndexPath(session.id, existingPath);
    return existingPath;
  }

  await ensureCreatablePathWithinDataDir(nextPath);
  await fs.mkdir(path.dirname(nextPath), { recursive: true });
  try {
    const existingNextMarkdown = await fs.readFile(
      await ensureExistingPathWithinDataDir(nextPath),
      'utf-8'
    );
    const existingNextSession = markdownToSession(existingNextMarkdown);
    if (existingNextSession.id !== session.id) {
      throw new Error(
        `Cannot move session ${session.id} to ${nextPath} because another session already exists there`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const tempPath = getTempPathForTarget(nextPath);

  try {
    await ensureCreatablePathWithinDataDir(tempPath);
    await fs.writeFile(tempPath, markdown, { encoding: 'utf-8', flag: 'wx' });

    let committedAtNextPath = false;
    try {
      await ensureCreatablePathWithinDataDir(nextPath);
      await fs.writeFile(nextPath, markdown, {
        encoding: 'utf-8',
        flag: 'wx',
      });
      committedAtNextPath = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }

      const existingNextMarkdown = await fs.readFile(
        await ensureExistingPathWithinDataDir(nextPath),
        'utf-8'
      );
      const existingNextSession = markdownToSession(existingNextMarkdown);
      if (existingNextSession.id !== session.id) {
        throw new Error(
          `Cannot move session ${session.id} to ${nextPath} because another session already exists there`
        );
      }
      if (existingNextMarkdown !== markdown) {
        await ensureCreatablePathWithinDataDir(nextPath);
        await fs.writeFile(nextPath, markdown, {
          encoding: 'utf-8',
        });
      }
      committedAtNextPath = true;
    }

    if (committedAtNextPath) {
      try {
        await fs.unlink(await ensureExistingPathWithinDataDir(existingPath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      await updateSessionIndexPath(session.id, nextPath);
    }
  } catch (error) {
    throw error;
  } finally {
    await fs.unlink(tempPath).catch(() => undefined);
  }

  return nextPath;
}

/**
 * Delete a session by ID
 */
export async function deleteSession(id: string): Promise<void> {
  const initialPath = await findSessionFileById(id);
  if (!initialPath) {
    throw new Error(`Session with ID ${id} not found`);
  }

  await ensureExistingPathWithinDataDir(initialPath);

  let deleteError: unknown;
  let indexCleanupError: unknown;

  try {
    await fs.unlink(await ensureExistingPathWithinDataDir(initialPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      deleteError = error;
    } else {
      const relocatedPath = await findSessionFileById(id);
      if (relocatedPath && relocatedPath !== initialPath) {
        try {
          await fs.unlink(await ensureExistingPathWithinDataDir(relocatedPath));
        } catch (retryError) {
          if ((retryError as NodeJS.ErrnoException).code !== 'ENOENT') {
            deleteError = retryError;
          }
        }
      }
    }
  } finally {
    try {
      await removeSessionIndex(id);
    } catch (error) {
      indexCleanupError = error;
    }
  }

  if (deleteError) {
    throw deleteError;
  }
  if (indexCleanupError) {
    throw indexCleanupError;
  }
}

/**
 * Find the file path of a session by its ID
 * Returns null if not found
 */
export async function findSessionFileById(id: string): Promise<string | null> {
  const safeId = sanitizeSessionId(id);
  const matchingPaths = new Set<string>();
  const indexedRecord = await readSessionIndex(safeId);
  if (indexedRecord) {
    try {
      const markdown = await fs.readFile(
        await ensureExistingPathWithinDataDir(indexedRecord.path),
        'utf-8'
      );
      const parsedSession = markdownToSession(markdown);
      if (parsedSession.id === safeId) {
        matchingPaths.add(indexedRecord.path);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to validate indexed session for ${safeId}`, error);
      }
    }
  }

  try {
    const rootDir = getDataDir();
    const years = await fs.readdir(rootDir);

    for (const year of years) {
      if (isSessionIndexDirName(year) || !isYearDirName(year)) continue;
      const yearPath = path.join(rootDir, year);
      let safeYearPath: string;
      try {
        safeYearPath = await ensureNonSymlinkDirectory(yearPath);
      } catch {
        continue;
      }

      const months = await fs.readdir(safeYearPath);
      for (const month of months) {
        if (!isMonthDirName(month)) continue;
        const monthPath = path.join(safeYearPath, month);
        let safeMonthPath: string;
        try {
          safeMonthPath = await ensureNonSymlinkDirectory(monthPath);
        } catch {
          continue;
        }

        const files = await fs.readdir(safeMonthPath);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          try {
            const filePath = await ensureExistingPathWithinDataDir(
              path.join(safeMonthPath, file)
            );
            const markdown = await fs.readFile(filePath, 'utf-8');
            const parsedSession = markdownToSession(markdown);
            if (parsedSession.id === safeId) {
              matchingPaths.add(filePath);
            }
          } catch {
            // Skip files that can't be parsed
          }
        }
      }
    }

    const uniqueMatches = [...matchingPaths].sort();
    if (uniqueMatches.length === 0) {
      return null;
    }
    if (uniqueMatches.length === 1) {
      return uniqueMatches[0];
    }
    throw new DuplicateSessionIdError(safeId, uniqueMatches);
  } catch (e) {
    if (isDuplicateSessionIdError(e)) {
      throw e;
    }
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error('Error finding session file by ID', e);
    return null;
  }
}

/**
 * Check if the data directory has any sessions
 * Useful for determining if migration is needed
 */
export async function hasAnySessions(): Promise<boolean> {
  try {
    const rootDir = getDataDir();
    const years = await fs.readdir(rootDir);
    for (const year of years) {
      if (isSessionIndexDirName(year) || !isYearDirName(year)) continue;
      const yearPath = path.join(rootDir, year);
      let safeYearPath: string;
      try {
        safeYearPath = await ensureNonSymlinkDirectory(yearPath);
      } catch {
        continue;
      }
      void safeYearPath;
      return true;
    }
    return false;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw e;
  }
}
