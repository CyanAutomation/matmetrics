/**
 * Techniques validation and normalization utilities
 */

export function validateTechniques(
  techniques: unknown
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(techniques)) {
    return {
      ok: false,
      error: 'Invalid techniques: expected an array of non-empty strings',
    };
  }

  const validated: string[] = [];

  for (let i = 0; i < techniques.length; i += 1) {
    const t = techniques[i];

    if (typeof t !== 'string') {
      return { ok: false, error: `Invalid techniques[${i}]: expected a string` };
    }

    const trimmed = t.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: `Invalid techniques[${i}]: value cannot be empty`,
      };
    }

    validated.push(trimmed);
  }

  // Deduplicate while preserving order
  return { ok: true, value: [...new Set(validated)] };
}

/**
 * Deduplicate techniques array, removing consecutive and non-consecutive duplicates
 * while preserving the original order of first occurrence.
 */
export function deduplicateTechniques(techniques: string[]): string[] {
  return [...new Set(techniques)];
}
