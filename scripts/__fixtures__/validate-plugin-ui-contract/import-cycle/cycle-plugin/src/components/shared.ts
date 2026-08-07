/**
 * Shared utilities for helper modules.
 * This module breaks the circular dependency between helper-a and helper-b.
 */

export const checkFunctionType = (value: unknown): boolean => {
  return typeof value === 'function';
};
