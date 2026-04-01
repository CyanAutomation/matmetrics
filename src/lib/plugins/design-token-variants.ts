const kebabCaseSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const LEGACY_SEGMENT_MIGRATIONS: Record<string, string> = {
  githubSync: 'github-sync',
  promptSettings: 'prompt-settings',
  tagManager: 'tag-manager',
  videoLibrary: 'video-library',
  logDoctor: 'log-doctor',
  filterPanel: 'filter-panel',
  diffPreview: 'diff-preview',
  filterBar: 'filter-bar',
  actionRow: 'action-row',
};

export type DesignTokenVariantValidationResult =
  | {
      ok: true;
      canonical: string;
      wasMigrated: boolean;
    }
  | {
      ok: false;
      error: string;
    };

const resolveLegacySegment = (segment: string): string | null => {
  const migrated = LEGACY_SEGMENT_MIGRATIONS[segment];
  if (migrated) {
    return migrated;
  }

  if (segment.includes('_')) {
    return null;
  }

  return null;
};

export const validateAndNormalizeDesignTokenVariant = (
  value: string
): DesignTokenVariantValidationResult => {
  const rawSegments = value.split('.').map((segment) => segment.trim());
  if (rawSegments.length === 0 || rawSegments.some((segment) => !segment)) {
    return {
      ok: false,
      error:
        'Design token variant keys must use non-empty dot-separated segments.',
    };
  }

  let wasMigrated = false;
  const canonicalSegments: string[] = [];

  for (const segment of rawSegments) {
    if (kebabCaseSegmentPattern.test(segment)) {
      canonicalSegments.push(segment);
      continue;
    }

    const migrated = resolveLegacySegment(segment);
    if (migrated && kebabCaseSegmentPattern.test(migrated)) {
      wasMigrated = true;
      canonicalSegments.push(migrated);
      continue;
    }

    if (segment.includes('_')) {
      return {
        ok: false,
        error:
          'Legacy underscore token keys are not supported unless explicitly listed in migration mappings.',
      };
    }

    return {
      ok: false,
      error:
        'Design token variant keys must use kebab-case segments (lowercase letters, numbers, and hyphens only).',
    };
  }

  return {
    ok: true,
    canonical: canonicalSegments.join('.'),
    wasMigrated,
  };
};
