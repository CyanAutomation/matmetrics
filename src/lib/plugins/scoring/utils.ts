/**
 * Shared utility functions for plugin scoring.
 * Extracted from duplicated code across scoring category files.
 */

import { access } from 'node:fs/promises';

/**
 * Adds a value to an array only if it's not already present.
 * Used to collect unique evidence, reasons, and actions.
 */
export const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) {
    values.push(value);
  }
};

/**
 * Checks if a file exists at the given path.
 * Used to verify presence of manifests, entry modules, READMEs, etc.
 */
export const fileExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Converts a component ID to a basename for file lookups.
 * Example: 'log-doctor-audit-results' -> 'log-doctor-audit-results'
 */
export const componentIdToComponentBasename = (componentId: string): string =>
  componentId.trim().toLowerCase().replace(/_/g, '-');
