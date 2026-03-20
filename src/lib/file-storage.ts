import { promises as fs } from 'fs';
import path from 'path';
import { JudoSession } from './types';
import { markdownToSession, sessionToMarkdown } from './markdown-serializer';
import { compareDateOnlyDesc } from './utils';

let dataDir = path.join(process.cwd(), 'data');

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
  if (sessionId.length > 100) {
    throw new Error(
      'Session ID exceeds maximum allowed length of 100 characters'
    );
  }
  return sessionId.replace(/[^a-zA-Z0-9-_]/g, '-');
}

function ensurePathWithinDataDir(filePath: string): string {
  const root = path.resolve(getDataDir());
  const resolved = path.resolve(filePath);

  // Ensure the resolved path is within the configured data directory
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Resolved session file path escapes data directory');
  }

  return filePath;
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
  const [year, month, day] = date.split('-');
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
  const [, year, month, dayMatch] =
    filePath.match(/(\d{4})\/(\d{2})\/(\d{8})/) || [];
  if (!dayMatch) return null;
  const day = dayMatch.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/**
 * Find the next available counter for a given date
 * Used when creating multiple sessions on the same day
 */
export async function getNextCounter(date: string): Promise<number> {
  const dirPath = ensurePathWithinDataDir(
    path.join(getDataDir(), date.slice(0, 4), date.slice(5, 7))
  );

  try {
    const files = await fs.readdir(dirPath);
    const datePrefix = date.replace(/-/g, '');

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
      const yearPath = path.join(getDataDir(), year);
      const stat = await fs.stat(yearPath);
      if (!stat.isDirectory()) continue;

      const months = await fs.readdir(yearPath);

      for (const month of months) {
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
  const dirPath = ensurePathWithinDataDir(
    path.join(getDataDir(), session.date.slice(0, 4), session.date.slice(5, 7))
  );

  // Ensure directory exists
  await fs.mkdir(dirPath, { recursive: true });

  const markdown = sessionToMarkdown(session);

  // Prefer ID-based filenames to avoid counter contention in concurrent creates.
  if (!session.id || typeof session.id !== 'string') {
    throw new Error('Session ID is required and must be a non-empty string');
  }
  const filePath = getSessionFilePath(session.date, undefined, session.id);
  const assertExistingSessionMatches = async (
    existingPath: string
  ): Promise<string> => {
    const existingMarkdown = await fs.readFile(existingPath, 'utf-8');
    if (existingMarkdown !== markdown) {
      throw new Error(
        `Session ID ${session.id} already exists with different content; refusing to overwrite existing data`
      );
    }
    return existingPath;
  };

  // Idempotency: if this ID already exists (canonical path or legacy location), return success.
  try {
    await fs.access(filePath);
    return await assertExistingSessionMatches(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
  }

  const existingPath = await findSessionFileById(session.id);
  if (existingPath) {
    return await assertExistingSessionMatches(existingPath);
  }

  try {
    await fs.writeFile(filePath, markdown, {
      encoding: 'utf-8',
      flag: 'wx',
    });
    return filePath;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      // Another request wrote this session ID concurrently. Only treat as idempotent
      // success if the existing on-disk content exactly matches this write attempt.
      const concurrentExistingPath = await findSessionFileById(session.id);
      if (concurrentExistingPath) {
        return await assertExistingSessionMatches(concurrentExistingPath);
      }
      throw new Error(
        `Session ID ${session.id} was created concurrently but could not be validated safely`
      );
    }
    throw e;
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

  const nextPath = ensurePathWithinDataDir(
    getSessionFilePath(session.date, undefined, session.id)
  );
  const markdown = sessionToMarkdown(session);

  if (existingPath === nextPath) {
    await fs.writeFile(existingPath, markdown, 'utf-8');
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
  const backupPath = ensurePathWithinDataDir(
    `${existingPath}.bak-${process.pid}-${Date.now()}`
  );

  try {
    await fs.writeFile(tempPath, markdown, { encoding: 'utf-8', flag: 'wx' });
    await fs.rename(existingPath, backupPath);
    await fs.rename(tempPath, nextPath);
    await fs.unlink(backupPath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    try {
      await fs.access(backupPath);
      await fs.rename(backupPath, existingPath);
    } catch {
      // Best-effort rollback only.
    }
    throw error;
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
}

/**
 * Find the file path of a session by its ID
 * Returns null if not found
 */
export async function findSessionFileById(id: string): Promise<string | null> {
  try {
    const years = await fs.readdir(getDataDir());

    for (const year of years) {
      const yearPath = path.join(getDataDir(), year);
      const yearStat = await fs.stat(yearPath);
      if (!yearStat.isDirectory()) continue;

      const months = await fs.readdir(yearPath);
      for (const month of months) {
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
            if (parsedSession.id === id) {
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
    return years.length > 0;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw e;
  }
}
