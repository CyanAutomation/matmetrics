/**
 * Path validation utilities for file system safety
 */

/**
 * Validates that a path is safe for log file operations.
 * Must:
 * - Start with 'data/'
 * - End with '.md'
 * - Not contain path traversal attempts
 * - Not be a directory reference
 * - Not contain null bytes
 */
export function isSafeLogPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').trim();
  if (!normalized) return false;
  if (normalized.startsWith('/') || normalized.includes('\0')) return false;
  if (normalized.endsWith('/')) return false;
  if (!normalized.startsWith('data/')) return false;
  if (!normalized.endsWith('.md')) return false;

  const segments = normalized.split('/');
  return segments.every(
    (segment) => segment !== '' && segment !== '.' && segment !== '..'
  );
}

/**
 * Validates that a path is safe for general file operations.
 * More permissive than isSafeLogPath but still prevents traversal attacks.
 */
export function isSafeFilePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').trim();
  if (!normalized) return false;
  if (normalized.includes('\0')) return false;

  const segments = normalized.split('/');
  return segments.every((segment) => segment !== '..' && segment !== '');
}

/**
 * Normalizes a file path by removing redundant separators and resolving dots.
 * Does NOT resolve symlinks or make the path absolute.
 */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}
