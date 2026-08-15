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
