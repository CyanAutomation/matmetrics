import { promises as fs } from 'fs';
import path from 'path';
import { JudoSession } from './types';
import { markdownToSession, sessionToMarkdown } from './markdown-serializer';
import { compareDateOnlyDesc } from './utils';

let dataDir = path.join(process.cwd(), 'data');
const SESSION_INDEX_DIR = '.index';
const SESSION_INDEX_POLL_ATTEMPTS = 20;
const SESSION_INDEX_POLL_DELAY_MS = 10;
const YEAR_DIR_PATTERN = /^\d{4}$/;
const MONTH_DIR_PATTERN = /^(0[1-9]|1[0-2])$/;

interface SessionIndexRecord {
  id: string;
  path: string;
}

function getDataDir(): string {
  return dataDir;
}

export function __setDataDirForTests(nextDataDir: string): void {
  dataDir = nextDataDir;
}

export function __resetDataDirForTests(): void {
  dataDir = path.join(process.cwd(), 'data');
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

function ensurePathWithinDataDir(filePath: string): string {
  const root = path.resolve(getDataDir());
  const resolved = path.resolve(filePath);

  // Ensure the resolved path is within the configured data directory
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Resolved session file path escapes data directory');
  }

  // Always return the normalized, validated path
  return resolved;
}

function getSessionIndexDirPath(): string {
  return ensurePathWithinDataDir(path.join(getDataDir(), SESSION_INDEX_DIR));
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
  return ensurePathWithinDataDir(
    path.join(getSessionIndexDirPath(), `${sanitizeSessionId(sessionId)}.json`)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readSessionIndex(
  sessionId: string
): Promise<SessionIndexRecord | null> {
  const indexPath = getSessionIndexFilePath(sessionId);
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SessionIndexRecord>;
    if (
      parsed &&
      parsed.id === sessionId &&
      typeof parsed.path === 'string' &&
      parsed.path.length > 0
    ) {
      return {
        id: parsed.id,
        path: ensurePathWithinDataDir(parsed.path),
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
  flag: 'wx' | 'w'
): Promise<void> {
  const record: SessionIndexRecord = {
    id: sessionId,
    path: ensurePathWithinDataDir(sessionPath),
  };
  const indexPath = getSessionIndexFilePath(sessionId);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(record), {
    encoding: 'utf-8',
    flag,
  });
}

async function resolveIndexedSessionPath(sessionId: string): Promise<string | null> {
  for (let attempt = 0; attempt < SESSION_INDEX_POLL_ATTEMPTS; attempt += 1) {
    const indexed = await readSessionIndex(sessionId);
    if (indexed) {
      try {
        await fs.access(indexed.path);
        return indexed.path;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    await sleep(SESSION_INDEX_POLL_DELAY_MS);
  }

  return null;
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
  return ensurePathWithinDataDir(path.join(getDataDir(), year, month, baseName));
}

/**
 * Extract date from a session file path
 * Reverse of getSessionFilePath
 */
export function extractDateFromPath(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const [, year, month, dayMatch] =
    normalizedPath.match(/(?:^|\/)(\d{4})\/(\d{2})\/(\d{8})(?=[^0-9]|$)/) ||
    [];
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
  const dirPath = ensurePathWithinDataDir(
    path.join(getDataDir(), year, month)
  );

  try {
    const files = await fs.readdir(dirPath);
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
    const years = await fs.readdir(getDataDir());

    for (const year of years) {
      if (isSessionIndexDirName(year) || !isYearDirName(year)) continue;
      const yearPath = path.join(getDataDir(), year);
      const stat = await fs.stat(yearPath);
      if (!stat.isDirectory()) continue;

      const months = await fs.readdir(yearPath);

      for (const month of months) {
        if (!isMonthDirName(month)) continue;
        const monthPath = path.join(yearPath, month);
        const stat = await fs.stat(monthPath);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(monthPath);

        for (const file of files) {
          if (!file.endsWith('.md')) continue;

          try {
            const filePath = path.join(monthPath, file);
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
    const markdown = await fs.readFile(filePath, 'utf-8');
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
  const dirPath = ensurePathWithinDataDir(
    path.join(getDataDir(), year, month)
  );

  // Ensure directory exists
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
    const safeExistingPath = ensurePathWithinDataDir(existingPath);
    const existingMarkdown = await fs.readFile(safeExistingPath, 'utf-8');
    if (existingMarkdown !== markdown) {
      throw new Error(
        `Session ID ${session.id} already exists with different content; refusing to overwrite existing data`
      );
    }
    return safeExistingPath;
  };
  let hasIndexLock = false;

  try {
    await writeSessionIndex(session.id, filePath, 'wx');
    hasIndexLock = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    const indexedExistingPath = await resolveIndexedSessionPath(session.id);
    if (!indexedExistingPath) {
      const existingIndexRecord = await readSessionIndex(session.id);
      const lockStateDescription = existingIndexRecord
        ? 'appears abandoned or unresolved'
        : 'is still in progress';
      throw new Error(
        `Session ID ${session.id} is locked by another create operation and ${lockStateDescription}`
      );
    }
    return await assertExistingSessionMatches(indexedExistingPath);
  }

  try {
    await fs.writeFile(filePath, markdown, {
      encoding: 'utf-8',
      flag: 'wx',
    });
    await writeSessionIndex(session.id, filePath, 'w');
    return filePath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const concurrentExistingPath = await resolveIndexedSessionPath(session.id);
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

async function updateSessionIndexPath(id: string, sessionPath: string): Promise<void> {
  try {
    await writeSessionIndex(id, sessionPath, 'w');
  } catch (error) {
    console.warn(`Failed to update session index for ${id}`, error);
  }
}

async function removeSessionIndex(id: string): Promise<void> {
  const indexPath = getSessionIndexFilePath(id);
  try {
    await fs.unlink(indexPath);
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
  ensurePathWithinDataDir(existingPath);

  const nextPath = getSessionFilePath(session.date, undefined, session.id);
  const markdown = sessionToMarkdown(session);

  if (existingPath === nextPath) {
    await fs.writeFile(existingPath, markdown, 'utf-8');
    await updateSessionIndexPath(session.id, existingPath);
    return existingPath;
  }

  await fs.mkdir(path.dirname(nextPath), { recursive: true });
  try {
    const existingNextMarkdown = await fs.readFile(nextPath, 'utf-8');
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

  const tempPath = ensurePathWithinDataDir(
    `${nextPath}.tmp-${process.pid}-${Date.now()}`
  );

  try {
    await fs.writeFile(tempPath, markdown, { encoding: 'utf-8', flag: 'wx' });

    let committedAtNextPath = false;
    try {
      await fs.writeFile(nextPath, markdown, {
        encoding: 'utf-8',
        flag: 'wx',
      });
      committedAtNextPath = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }

      const existingNextMarkdown = await fs.readFile(nextPath, 'utf-8');
      const existingNextSession = markdownToSession(existingNextMarkdown);
      if (existingNextSession.id !== session.id) {
        throw new Error(
          `Cannot move session ${session.id} to ${nextPath} because another session already exists there`
        );
      }
      if (existingNextMarkdown !== markdown) {
        await fs.writeFile(nextPath, markdown, {
          encoding: 'utf-8',
        });
      }
      committedAtNextPath = true;
    }

    if (committedAtNextPath) {
      try {
        await fs.unlink(existingPath);
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
  const filePath = await findSessionFileById(id);
  if (!filePath) {
    throw new Error(`Session with ID ${id} not found`);
  }

  ensurePathWithinDataDir(filePath);
  await fs.unlink(filePath);
  await removeSessionIndex(id);
}

/**
 * Find the file path of a session by its ID
 * Returns null if not found
 */
export async function findSessionFileById(id: string): Promise<string | null> {
  const safeId = sanitizeSessionId(id);
  const indexedRecord = await readSessionIndex(safeId);
  if (indexedRecord) {
    try {
      const markdown = await fs.readFile(indexedRecord.path, 'utf-8');
      const parsedSession = markdownToSession(markdown);
      if (parsedSession.id === safeId) {
        return indexedRecord.path;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`Failed to validate indexed session for ${safeId}`, error);
      }
    }
  }

  try {
    const years = await fs.readdir(getDataDir());

    for (const year of years) {
      if (isSessionIndexDirName(year) || !isYearDirName(year)) continue;
      const yearPath = path.join(getDataDir(), year);
      const yearStat = await fs.stat(yearPath);
      if (!yearStat.isDirectory()) continue;

      const months = await fs.readdir(yearPath);
      for (const month of months) {
        if (!isMonthDirName(month)) continue;
        const monthPath = path.join(yearPath, month);
        const monthStat = await fs.stat(monthPath);
        if (!monthStat.isDirectory()) continue;

        const files = await fs.readdir(monthPath);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          const filePath = ensurePathWithinDataDir(path.join(monthPath, file));
          try {
            const markdown = await fs.readFile(filePath, 'utf-8');
            const parsedSession = markdownToSession(markdown);
            if (parsedSession.id === safeId) {
              return filePath;
            }
          } catch {
            // Skip files that can't be parsed
          }
        }
      }
    }

    return null;
  } catch (e) {
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
    const years = await fs.readdir(getDataDir());
    for (const year of years) {
      if (isSessionIndexDirName(year) || !isYearDirName(year)) continue;
      const yearPath = path.join(getDataDir(), year);
      const yearStat = await fs.stat(yearPath);
      if (!yearStat.isDirectory()) continue;
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
