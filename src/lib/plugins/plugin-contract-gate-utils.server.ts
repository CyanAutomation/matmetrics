import { access } from 'node:fs/promises';

/**
 * Server-only utilities for plugin contract validation.
 * This file contains functions that require Node.js file system access.
 * Do not import from client-side code.
 */

/**
 * Checks if a file exists at the given path.
 * Server-only function that requires Node.js fs/promises.
 */
export const exists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};
