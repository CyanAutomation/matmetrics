/**
 * Release Validation Module
 *
 * Extracted validators for changelog parsing to reduce cognitive complexity
 * of parseChangelog function.
 */

import { type ReleaseEntry, RELEASE_SECTION_LABELS } from './releases';

// ============================================================================
// Re-exports
// ============================================================================

export type { ReleaseEntry };

// ============================================================================
// Types
// ============================================================================

export type ValidationError = {
  type: 'invalid-date' | 'invalid-version' | 'invalid-section' | 'inconsistent';
  context: string;
  message: string;
};

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationError[];
};

// ============================================================================
// Constants
// ============================================================================

const VALID_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SECTION_LABELS = new Set<string>(RELEASE_SECTION_LABELS);
const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

// ============================================================================
// Validators
// ============================================================================

/**
 * Validate that a string is a valid ISO 8601 date
 */
export function validateIsoDate(value: string, context: string): ValidationError | null {
  if (!VALID_DATE_PATTERN.test(value)) {
    return {
      type: 'invalid-date',
      context,
      message: `${context} must use YYYY-MM-DD format.`,
    };
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return {
      type: 'invalid-date',
      context,
      message: `${context} must be a valid calendar date.`,
    };
  }

  return null;
}

/**
 * Validate semantic version format
 */
export function validateSemanticVersion(
  version: string,
  context: string
): ValidationError | null {
  if (!SEMANTIC_VERSION_PATTERN.test(version)) {
    return {
      type: 'invalid-version',
      context,
      message: `${context}: ${version} is not a valid semantic version.`,
    };
  }

  return null;
}

/**
 * Validate a release section label
 */
export function validateSectionLabel(
  label: string,
  context: string
): ValidationError | null {
  if (!ALLOWED_SECTION_LABELS.has(label)) {
    return {
      type: 'invalid-section',
      context,
      message: `${context}: '${label}' is not a recognized section. Allowed: ${Array.from(
        ALLOWED_SECTION_LABELS
      ).join(', ')}`,
    };
  }

  return null;
}

/**
 * Validate that release versions are in descending order
 */
export function validateReleaseVersionOrdering(
  releases: ReleaseEntry[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < releases.length - 1; i++) {
    const current = releases[i];
    const next = releases[i + 1];

    const comparison = compareSemanticVersions(current.version, next.version);
    if (comparison <= 0) {
      errors.push({
        type: 'inconsistent',
        context: `Release ordering`,
        message: `Version ${current.version} should come before ${next.version} (versions must be in descending order).`,
      });
    }
  }

  return errors;
}

/**
 * Validate that all releases have valid dates
 */
export function validateReleaseDates(
  releases: ReleaseEntry[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const release of releases) {
    const dateError = validateIsoDate(
      release.date,
      `Release ${release.version} date`
    );
    if (dateError) {
      errors.push(dateError);
    }
  }

  return errors;
}

/**
 * Validate that all releases have valid versions
 */
export function validateReleaseVersions(
  releases: ReleaseEntry[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const release of releases) {
    const versionError = validateSemanticVersion(
      release.version,
      `Release version`
    );
    if (versionError) {
      errors.push(versionError);
    }
  }

  return errors;
}

/**
 * Validate that all section labels are recognized
 */
export function validateSectionLabels(
  releases: ReleaseEntry[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const release of releases) {
    for (const section of release.sections) {
      const labelError = validateSectionLabel(
        section.label,
        `Release ${release.version}, section`
      );
      if (labelError) {
        errors.push(labelError);
      }
    }
  }

  return errors;
}

/**
 * Validate section content is not empty
 */
export function validateSectionContent(
  releases: ReleaseEntry[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const release of releases) {
    for (const section of release.sections) {
      if (section.items.length === 0) {
        errors.push({
          type: 'invalid-section',
          context: `Release ${release.version}, section ${section.label}`,
          message: `Section '${section.label}' is empty. Remove empty sections or add items.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Comprehensive validation of all releases
 */
export function validateReleases(releases: ReleaseEntry[]): ValidationResult {
  const errors: ValidationError[] = [];

  errors.push(...validateReleaseVersions(releases));
  errors.push(...validateReleaseDates(releases));
  errors.push(...validateReleaseVersionOrdering(releases));
  errors.push(...validateSectionLabels(releases));
  errors.push(...validateSectionContent(releases));

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Compare semantic versions
 * Returns: positive if left > right, negative if left < right, 0 if equal
 */
function compareSemanticVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => parseInt(part, 10));
  const rightParts = right.split('.').map((part) => parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export { compareSemanticVersions };
