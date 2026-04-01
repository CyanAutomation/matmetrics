export const CANONICAL_DESIGN_TOKEN_KEYS = [
  'primary',
  'primary-container',
  'primary-fixed',
  'on-primary',
  'on-primary-container',
  'secondary',
  'tertiary',
  'secondary-container',
  'on-secondary',
  'on-secondary-container',
  'surface',
  'surface-container-low',
  'surface-container-lowest',
  'surface-container-high',
  'surface-bright',
  'surface-tint',
  'surface-variant',
  'on-surface',
  'on-surface-variant',
  'outline',
  'outline-variant',
  'success',
  'success-container',
  'on-success',
  'on-success-container',
  'warning',
  'warning-container',
  'on-warning',
  'on-warning-container',
  'error',
  'error-container',
  'on-error',
  'on-error-container',
  'info',
  'info-container',
  'on-info',
  'on-info-container',
  'primary-hover',
  'primary-pressed',
  'primary-focus',
  'primary-disabled',
  'secondary-hover',
  'secondary-pressed',
  'secondary-focus',
  'secondary-disabled',
  'trend-positive',
  'trend-positive-container',
  'on-trend-positive-container',
  'trend-negative',
  'trend-negative-container',
  'on-trend-negative-container',
  'trend-neutral',
  'trend-neutral-container',
  'on-trend-neutral-container',
] as const;

export type CanonicalDesignTokenKey =
  (typeof CANONICAL_DESIGN_TOKEN_KEYS)[number];

export const LEGACY_DESIGN_TOKEN_KEY_MIGRATIONS = {
  primary_container: 'primary-container',
  secondary_container: 'secondary-container',
  surface_container_low: 'surface-container-low',
  surface_container_lowest: 'surface-container-lowest',
  surface_container_high: 'surface-container-high',
  surface_variant: 'surface-variant',
  outline_variant: 'outline-variant',
  success_container: 'success-container',
  warning_container: 'warning-container',
  error_container: 'error-container',
  info_container: 'info-container',
  on_surface: 'on-surface',
  on_surface_variant: 'on-surface-variant',
  surface_bright: 'surface-bright',
  surface_tint: 'surface-tint',
  primary_fixed: 'primary-fixed',
} as const;

const kebabCaseTokenPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isKebabCaseDesignTokenKey = (value: string): boolean =>
  kebabCaseTokenPattern.test(value);

export const resolveDesignTokenKeyMigration = (
  tokenKey: string
): CanonicalDesignTokenKey | null => {
  const directMatch = CANONICAL_DESIGN_TOKEN_KEYS.find(
    (key) => key === tokenKey
  );
  if (directMatch) {
    return directMatch;
  }

  const migrated =
    LEGACY_DESIGN_TOKEN_KEY_MIGRATIONS[
      tokenKey as keyof typeof LEGACY_DESIGN_TOKEN_KEY_MIGRATIONS
    ];

  return migrated ?? null;
};

export const cssColorVariableName = (
  tokenKey: CanonicalDesignTokenKey
): string => `--color-${tokenKey}`;
