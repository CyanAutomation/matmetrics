/**
 * Directory Scanner Module
 *
 * Handles filesystem traversal and session file discovery with safety checks.
 * Reduces cognitive complexity by extracting nested directory scanning logic.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { JudoSession } from './types';
import { markdownToSession } from './markdown-serializer';

// ============================================================================
// Types
// ============================================================================

export type SessionScanResult = {
  path: string;
  session: JudoSession;
};

export type DirectoryScanError = {
  type: 'operational' | 'not-found' | 'unsafe-path';
  path: string;
  cause?: unknown;
};

// ============================================================================
// Pattern Validation
// ============================================================================

const YEAR_DIR_PATTERN = /^\d{4}$/;
const MONTH_DIR_PATTERN = /^(0[1-9]|1[0-2])$/;

export function isYearDirName(name: string): boolean {
  return YEAR_DIR_PATTERN.test(name);
}

export function isMonthDirName(name: string): boolean {
  return MONTH_DIR_PATTERN.test(name);
}

// ============================================================================
// Directory Safety Checks
// ============================================================================

/**
 * Ensure a path doesn't escape the data directory (security check)
 */
export async function ensureNonSymlinkDirectory(targetPath: string): Promise<string> {
  try {
    const stats = await fs.lstat(targetPath);

    if (stats.isSymbolicLink()) {
      throw new Error(`Unsafe session directory: ${targetPath} is a symbolic link`);
    }

    if (!stats.isDirectory()) {
      throw new Error(`Unsafe session directory: ${targetPath} is not a directory`);
    }

    return targetPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw error;
    }
    throw error;
  }
}

/**
 * Verify a file path is safe to read
 */
export async function ensureExistingPathWithinDataDir(
  filePath: string,
  dataDir?: string
): Promise<string> {
  if (dataDir && !path.resolve(filePath).startsWith(path.resolve(dataDir))) {
    throw new Error(`Path escapes data directory: ${filePath}`);
  }
  return filePath;
}

// ============================================================================
// Directory Scanning Helpers
// ============================================================================

/**
 * Scan a single month directory for session files matching the target ID
 */
export async function scanMonthDirectory(
  monthPath: string,
  sessionId: string,
  onSessionFound: (result: SessionScanResult) => void,
  onError: (error: DirectoryScanError) => void
): Promise<void> {
  let files: string[];
  try {
    files = await fs.readdir(monthPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    onError({
      type: 'operational',
      path: monthPath,
      cause: error,
    });
    return;
  }

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    try {
      const filePath = path.join(monthPath, file);
      const markdown = await fs.readFile(filePath, 'utf-8');
      const parsedSession = markdownToSession(markdown);

      if (parsedSession.id === sessionId) {
        onSessionFound({
          path: filePath,
          session: parsedSession,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      console.warn(
        `Skipping unreadable or malformed session file: ${path.join(monthPath, file)}`,
        error
      );
      continue;
    }
  }
}

/**
 * Scan a year directory for session files in all months
 */
export async function scanYearDirectory(
  yearPath: string,
  sessionId: string,
  onSessionFound: (result: SessionScanResult) => void,
  onError: (error: DirectoryScanError) => void
): Promise<void> {
  let months: string[];
  try {
    months = await fs.readdir(yearPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    onError({
      type: 'operational',
      path: yearPath,
      cause: error,
    });
    return;
  }

  for (const month of months) {
    if (!isMonthDirName(month)) continue;

    const monthPath = path.join(yearPath, month);
    let safeMonthPath: string;

    try {
      safeMonthPath = await ensureNonSymlinkDirectory(monthPath);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith('Unsafe session directory:') ||
          error.message.includes('escapes data directory'))
      ) {
        onError({
          type: 'unsafe-path',
          path: monthPath,
          cause: error,
        });
        continue;
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      onError({
        type: 'operational',
        path: monthPath,
        cause: error,
      });
      continue;
    }

    await scanMonthDirectory(safeMonthPath, sessionId, onSessionFound, onError);
  }
}

/**
 * Scan the entire data directory for session files matching the target ID
 */
export async function scanDataDirectory(
  rootDir: string,
  sessionId: string,
  onSessionFound: (result: SessionScanResult) => void,
  onError: (error: DirectoryScanError) => void
): Promise<void> {
  let years: string[];

  try {
    years = await fs.readdir(rootDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    onError({
      type: 'not-found',
      path: rootDir,
      cause: error,
    });
    return;
  }

  for (const year of years) {
    if (!isYearDirName(year)) continue;

    const yearPath = path.join(rootDir, year);
    let safeYearPath: string;

    try {
      safeYearPath = await ensureNonSymlinkDirectory(yearPath);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith('Unsafe session directory:') ||
          error.message.includes('escapes data directory'))
      ) {
        onError({
          type: 'unsafe-path',
          path: yearPath,
          cause: error,
        });
        continue;
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      onError({
        type: 'operational',
        path: yearPath,
        cause: error,
      });
      continue;
    }

    await scanYearDirectory(safeYearPath, sessionId, onSessionFound, onError);
  }
}

/**
 * Collect all matching sessions from a directory scan
 */
export async function collectSessionsFromDirectory(
  rootDir: string,
  sessionId: string
): Promise<{
  matchingPaths: Set<string>;
  errors: DirectoryScanError[];
}> {
  const matchingPaths = new Set<string>();
  const errors: DirectoryScanError[] = [];

  await scanDataDirectory(
    rootDir,
    sessionId,
    (result) => {
      matchingPaths.add(result.path);
    },
    (error) => {
      errors.push(error);
    }
  );

  return { matchingPaths, errors };
}
