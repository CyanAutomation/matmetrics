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
// Unknown PID liveness locks are only reclaimed after this safety timeout.
// Active PID locks are never reclaimed by age alone.
const SESSION_UPDATE_LOCK_UNKNOWN_PID_RECLAIM_TIMEOUT_MS = 5 * 60 * 1000;
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

export class SessionNotFoundError extends Error {
  readonly code = 'SESSION_NOT_FOUND';
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session with ID ${sessionId} not found`);
    this.name = 'SessionNotFoundError';
    this.sessionId = sessionId;
  }
}

export function isSessionNotFoundError(
  error: unknown
): error is SessionNotFoundError {
  return error instanceof SessionNotFoundError;
}

export class SessionLookupOperationalError extends Error {
  readonly code = 'SESSION_LOOKUP_OPERATIONAL_ERROR';
  readonly sessionId: string;

  constructor(
    sessionId: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'SessionLookupOperationalError';
    this.sessionId = sessionId;
  }
}

export function isSessionLookupOperationalError(
  error: unknown
): error is SessionLookupOperationalError {
  return error instanceof SessionLookupOperationalError;
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

async function ensureExistingPathWithinDataDir(
  filePath: string
): Promise<string> {
  const resolved = ensureResolvedPathWithinDataDir(filePath);
  const realRoot = await getRealDataDirRoot();
  const realPath = await fs.realpath(resolved);

  if (!isPathWithinRoot(realRoot, realPath)) {
    throw new Error('Resolved session file path escapes data directory');
  }

  return resolved;
}

async function findClosestExistingAncestor(
  targetPath: string
): Promise<string> {
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

async function ensureCreatablePathWithinDataDir(
  filePath: string
): Promise<string> {
  const resolved = ensureResolvedPathWithinDataDir(filePath);
  const realRoot = await getRealDataDirRoot();
  const existingAncestor = await findClosestExistingAncestor(
    path.dirname(resolved)
  );
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

async function releaseSessionUpdateLock(
  lockPath: string,
  ownerId: string,
  ownerToken: string
): Promise<void> {
  const remainingRefCount = decrementSessionUpdateLockRefCount(
    lockPath,
    ownerId
  );
  if (remainingRefCount > 0) {
    return;
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let ownerMetadata: LockOwnerMetadata | null;
    try {
      ownerMetadata = parseLockOwnerMetadata(
        await fs.readFile(lockPath, 'utf-8')
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return;
      }
      throw error;
    }

    if (
      ownerMetadata === null ||
      ownerMetadata.ownerId !== ownerId ||
      (ownerMetadata.token !== null && ownerMetadata.token !== ownerToken)
    ) {
      return;
    }

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

type LockOwnerMetadata = {
  pid: number;
  ownerId: string | null;
  timestampMs: number | null;
  token: string | null;
};

const sessionUpdateLockReferenceCounts = new Map<string, number>();

function getSessionUpdateLockRefCountKey(
  lockPath: string,
  ownerId: string
): string {
  return `${lockPath}::${ownerId}`;
}

function incrementSessionUpdateLockRefCount(
  lockPath: string,
  ownerId: string
): void {
  const key = getSessionUpdateLockRefCountKey(lockPath, ownerId);
  const current = sessionUpdateLockReferenceCounts.get(key) ?? 0;
  sessionUpdateLockReferenceCounts.set(key, current + 1);
}

function decrementSessionUpdateLockRefCount(
  lockPath: string,
  ownerId: string
): number {
  const key = getSessionUpdateLockRefCountKey(lockPath, ownerId);
  const current = sessionUpdateLockReferenceCounts.get(key) ?? 0;
  if (current <= 1) {
    sessionUpdateLockReferenceCounts.delete(key);
    return 0;
  }

  const next = current - 1;
  sessionUpdateLockReferenceCounts.set(key, next);
  return next;
}

function encodeSessionUpdateLockMetadata(metadata: {
  pid: number;
  ownerId: string;
  token: string;
  timestampMs: number;
}): string {
  return `pid=${metadata.pid};owner=${metadata.ownerId};token=${metadata.token};ts=${metadata.timestampMs}`;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function parseStructuredLockOwnerMetadata(
  trimmed: string
): LockOwnerMetadata | null {
  if (!trimmed.includes('=')) {
    return null;
  }

  const entries = trimmed.split(';');
  const parsed = new Map<string, string>();
  for (const entry of entries) {
    const [key, value, ...rest] = entry.split('=');
    if (!key || value === undefined || rest.length > 0) {
      return null;
    }
    parsed.set(key, value);
  }

  const pidRaw = parsed.get('pid');
  const ownerId = parsed.get('owner') ?? null;
  const token = parsed.get('token') ?? null;
  const timestampRaw = parsed.get('ts');

  if (!pidRaw || !ownerId || !token || !timestampRaw) {
    return null;
  }

  const pid = Number.parseInt(pidRaw, 10);
  const timestampMs = Number.parseInt(timestampRaw, 10);

  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  if (!Number.isInteger(timestampMs) || timestampMs < 0) {
    return null;
  }

  if (!isValidUuid(token)) {
    return null;
  }

  return {
    pid,
    ownerId,
    token,
    timestampMs,
  };
}

function parseLockOwnerMetadata(lockContent: string): LockOwnerMetadata | null {
  const trimmed = lockContent.trim();
  if (!trimmed) {
    return null;
  }

  const structuredMetadata = parseStructuredLockOwnerMetadata(trimmed);
  if (structuredMetadata !== null) {
    return structuredMetadata;
  }

  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const pid = Number.parseInt(parts[0], 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  let timestampMs: number | null = null;
  let token: string | null = null;

  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index];
    if (/^\d+$/.test(part)) {
      const parsedTimestamp = Number.parseInt(part, 10);
      if (timestampMs !== null) {
        return null;
      }
      timestampMs = parsedTimestamp;
      continue;
    }

    if (isValidUuid(part)) {
      if (token !== null) {
        return null;
      }
      token = part;
      continue;
    }

    return null;
  }

  if (timestampMs === null && token === null) {
    return null;
  }

  return { pid, ownerId: null, timestampMs, token };
}

function getPidLiveness(pid: number): 'alive' | 'dead' | 'unknown' {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      return 'dead';
    }
    if (code === 'EPERM') {
      return 'alive';
    }
    return 'unknown';
  }
}

async function shouldReclaimSessionUpdateLock(
  lockPath: string
): Promise<boolean> {
  try {
    const [stats, rawLock] = await Promise.all([
      fs.stat(lockPath),
      fs.readFile(lockPath, 'utf-8'),
    ]);
    const lockAgeMs = Date.now() - stats.mtimeMs;
    const ownerMetadata = parseLockOwnerMetadata(rawLock);
    if (ownerMetadata === null) {
      return true;
    }

    const pidLiveness = getPidLiveness(ownerMetadata.pid);
    if (pidLiveness === 'dead') {
      // PID no longer exists, so the lock owner cannot release this lock.
      return true;
    }

    if (pidLiveness === 'alive') {
      // Active owner process: never reclaim by age.
      return false;
    }

    // Unknown liveness (for example, permission/runtime anomalies): reclaim only
    // after a conservative timeout to avoid deleting an actively-owned lock.
    if (lockAgeMs >= SESSION_UPDATE_LOCK_UNKNOWN_PID_RECLAIM_TIMEOUT_MS) {
      return true;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(
        `Failed to inspect session update lock at ${lockPath}`,
        error
      );
      return true;
    }
  }

  return false;
}

export async function __shouldReclaimSessionUpdateLockForTests(
  lockPath: string
): Promise<boolean> {
  return shouldReclaimSessionUpdateLock(lockPath);
}

export async function __acquireSessionUpdateLockForTests(
  sessionId: string,
  targetPath: string,
  ownerId: string
): Promise<() => Promise<void>> {
  return acquireSessionUpdateLock(sessionId, targetPath, ownerId);
}

async function acquireSessionUpdateLock(
  sessionId: string,
  targetPath: string,
  ownerId: string
): Promise<() => Promise<void>> {
  const lockPath = getSessionUpdateLockPath(targetPath);
  const ownerToken = randomUUID();
  const lockMetadata = encodeSessionUpdateLockMetadata({
    pid: process.pid,
    ownerId,
    token: ownerToken,
    timestampMs: Date.now(),
  });
  await ensureCreatablePathWithinDataDir(lockPath);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.writeFile(lockPath, `${lockMetadata}\n`, {
        encoding: 'utf-8',
        flag: 'wx',
      });
      incrementSessionUpdateLockRefCount(lockPath, ownerId);
      return async () => {
        await releaseSessionUpdateLock(lockPath, ownerId, ownerToken);
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }

      const existingMetadata = parseLockOwnerMetadata(
        await fs.readFile(lockPath, 'utf-8').catch((readError) => {
          if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
            return '';
          }
          throw readError;
        })
      );
      if (existingMetadata?.ownerId === ownerId) {
        incrementSessionUpdateLockRefCount(lockPath, ownerId);
        const reentrantToken = existingMetadata.token ?? ownerToken;
        return async () => {
          await releaseSessionUpdateLock(lockPath, ownerId, reentrantToken);
        };
      }

      const shouldReclaim = await shouldReclaimSessionUpdateLock(lockPath);
      if (!shouldReclaim) {
        throw new SessionUpdateConflictError(sessionId, targetPath);
      }

      try {
        await fs.unlink(lockPath);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new SessionUpdateConflictError(sessionId, targetPath);
        }
      }
    }
  }

  throw new SessionUpdateConflictError(sessionId, targetPath);
}

async function acquireSessionUpdateLocks(
  sessionId: string,
  targetPaths: string[]
): Promise<() => Promise<void>> {
  const uniquePaths = Array.from(new Set(targetPaths)).sort((a, b) =>
    a.localeCompare(b)
  );
  const releases: Array<() => Promise<void>> = [];
  const ownerId = randomUUID();

  try {
    for (const lockTargetPath of uniquePaths) {
      releases.push(
        await acquireSessionUpdateLock(sessionId, lockTargetPath, ownerId)
      );
    }

    return async () => {
      for (let index = releases.length - 1; index >= 0; index -= 1) {
        await releases[index]();
      }
    };
  } catch (error) {
    for (let index = releases.length - 1; index >= 0; index -= 1) {
      await releases[index]().catch(() => undefined);
    }
    throw error;
  }
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
    const safeExistingPath =
      await ensureExistingPathWithinDataDir(existingPath);
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
    throw new SessionNotFoundError(session.id);
  }
  await ensureExistingPathWithinDataDir(existingPath);

  const nextPath = getSessionFilePath(session.date, undefined, session.id);
  const markdown = sessionToMarkdown(session);

  if (existingPath === nextPath) {
    const releaseLock = await acquireSessionUpdateLocks(session.id, [
      existingPath,
    ]);
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

  const releaseLock = await acquireSessionUpdateLocks(session.id, [
    existingPath,
    nextPath,
  ]);
  try {
    const sourceMarkdown = await fs.readFile(
      await ensureExistingPathWithinDataDir(existingPath),
      'utf-8'
    );
    const sourceSession = markdownToSession(sourceMarkdown);
    if (sourceSession.id !== session.id) {
      throw new SessionUpdateConflictError(session.id, existingPath);
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
      await ensureCreatablePathWithinDataDir(nextPath);
      await fs.rename(tempPath, nextPath);
      try {
        await fs.unlink(await ensureExistingPathWithinDataDir(existingPath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      await updateSessionIndexPath(session.id, nextPath);
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  } finally {
    await releaseLock();
  }

  return nextPath;
}

/**
 * Delete a session by ID
 */
export async function deleteSession(id: string): Promise<void> {
  // Ensure the session exists before proceeding.
  const initialPath = await findSessionFileById(id);
  if (!initialPath) {
    throw new SessionNotFoundError(id);
  }

  // The delete operation must participate in the same path‑locking protocol
  // as updateSession to avoid the delete‑vs‑update race.
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Re‑resolve the current path in case it moved between attempts.
    const currentPath = await findSessionFileById(id);
    if (!currentPath) {
      // Session already vanished – clean up the index if needed and exit.
      try {
        await removeSessionIndex(id);
      } catch (e) {
        // ignore index cleanup errors when the session is gone
      }
      return;
    }

    // Acquire the same lock used by updateSession for the target path.
    const releaseLock = await acquireSessionUpdateLocks(id, [currentPath]);
    try {
      // Verify the path hasn't changed while we were waiting for the lock.
      const confirmedPath = await findSessionFileById(id);
      if (confirmedPath !== currentPath) {
        // Path changed – retry under a fresh lock.
        continue;
      }

      // Perform the delete while holding the lock.
      await fs.unlink(await ensureExistingPathWithinDataDir(currentPath));
      // Remove the index entry atomically with the lock held.
      await removeSessionIndex(id);
      return; // success
    } catch (error) {
      // Preserve the error to surface if all retries fail.
      lastError = error;
      // If the error is ENOENT we might have raced with another delete –
      // retry a few times before giving up.
    } finally {
      await releaseLock();
    }
  }

  // If we exit the loop without returning, the delete failed after retries.
  if (lastError) {
    throw lastError;
  }
  throw new Error('Failed to delete session after maximum retry attempts');
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
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Stale index record; continue to full scan.
      } else if (
        error instanceof Error &&
        error.message.includes('escapes data directory')
      ) {
        console.warn(`Ignoring unsafe index entry for ${safeId}`, error);
      } else {
        throw new SessionLookupOperationalError(
          safeId,
          `Failed to validate indexed session for ${safeId}`,
          { cause: error }
        );
      }
    }
  }

  const rootDir = getDataDir();
  let years: string[];
  try {
    years = await fs.readdir(rootDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new SessionLookupOperationalError(
      safeId,
      `Failed to scan session directory for ${safeId}`,
      { cause: error }
    );
  }

  for (const year of years) {
    if (isSessionIndexDirName(year) || !isYearDirName(year)) continue;
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
        continue;
      }
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw new SessionLookupOperationalError(
        safeId,
        `Failed to inspect session year directory ${yearPath}`,
        { cause: error }
      );
    }

    let months: string[];
    try {
      months = await fs.readdir(safeYearPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw new SessionLookupOperationalError(
        safeId,
        `Failed to read session year directory ${safeYearPath}`,
        { cause: error }
      );
    }
    for (const month of months) {
      if (!isMonthDirName(month)) continue;
      const monthPath = path.join(safeYearPath, month);
      let safeMonthPath: string;
      try {
        safeMonthPath = await ensureNonSymlinkDirectory(monthPath);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.startsWith('Unsafe session directory:') ||
            error.message.includes('escapes data directory'))
        ) {
          continue;
        }
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw new SessionLookupOperationalError(
          safeId,
          `Failed to inspect session month directory ${monthPath}`,
          { cause: error }
        );
      }

      let files: string[];
      try {
        files = await fs.readdir(safeMonthPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw new SessionLookupOperationalError(
          safeId,
          `Failed to read session month directory ${safeMonthPath}`,
          { cause: error }
        );
      }
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
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            continue;
          }
          throw new SessionLookupOperationalError(
            safeId,
            `Failed while scanning session file ${path.join(safeMonthPath, file)}`,
            { cause: error }
          );
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
