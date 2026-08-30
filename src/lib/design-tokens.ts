export interface DesignTokenDefinition {
  key: string;
  value: string;
  usage: string;
}

export interface DesignTokenGroup {
  heading: string;
  description?: string;
  subsections?: ReadonlyArray<{
    heading: string;
    tokens: readonly DesignTokenDefinition[];
  }>;
  tokens?: readonly DesignTokenDefinition[];
}

export const DESIGN_TOKEN_GROUPS = [
  {
    heading: 'Primary Tokens',
    description:
      'Core brand and emphasis colors for highest-priority actions and primary data.',
    tokens: [
      {
        key: 'primary',
        value: '#006bab (light), #296BCD (dark)',
        usage:
          'Primary action backgrounds, key chart series, high-emphasis links. MatMetrics Blue is the primary product signal.',
      },
      {
        key: 'primary-container',
        value: '#0075c2 (light), #0075d6 (dark)',
        usage: 'Elevated primary surfaces, gradient companion for primary CTAs',
      },
      {
        key: 'primary-fixed',
        value: '#d2e6ff (light), #0075d6 (dark)',
        usage:
          'Legacy-safe primary emphasis token (stable alias for primary emphasis during migration)',
      },
      {
        key: 'on-primary',
        value: '#ffffff',
        usage: 'Text/icons on `primary` backgrounds',
      },
      {
        key: 'on-primary-container',
        value: '#ffffff',
        usage: 'Text/icons on `primary-container`',
      },
      {
        key: 'on-primary-fixed',
        value: '#0d3b66 (light), #ffffff (dark)',
        usage:
          'Text/icons on `primary-fixed`; in light mode this preserves legacy high-contrast emphasis pairing used by info-container',
      },
    ],
  },
  {
    heading: 'Secondary & Tertiary Tokens',
    description:
      'Supporting accent colors for secondary actions and chart series.',
    tokens: [
      {
        key: 'secondary',
        value: '#515f78',
        usage: 'Secondary actions, supporting data series',
      },
      {
        key: 'tertiary',
        value: '#67587a',
        usage: 'Tertiary chart series and alternate data accents',
      },
      {
        key: 'secondary-container',
        value: '#d4e3ff',
        usage: 'Secondary chips, low-emphasis highlights',
      },
      {
        key: 'on-secondary',
        value: '#ffffff',
        usage: 'Text/icons on `secondary`',
      },
      {
        key: 'on-secondary-container',
        value: '#1b2a41',
        usage: 'Text/icons on `secondary-container`',
      },
    ],
  },
  {
    heading: 'Session Category Tokens',
    description:
      'Session type is a stable semantic meaning, not a chart-position colour. Use these tokens for the category dot, badge, progress indicator, filter result, and chart series everywhere in the product. Always pair the colour with the category label or icon.',
    tokens: [
      {
        key: 'category-technical',
        value: 'blue / blue',
        usage: 'Technical sessions and their associated data',
      },
      {
        key: 'category-technical-container',
        value: 'tonal blue surface',
        usage: 'Technical badges and low-emphasis content',
      },
      {
        key: 'on-category-technical-container',
        value: 'contrast text',
        usage: 'Text and icons on Technical containers',
      },
      {
        key: 'category-randori',
        value: 'teal / teal',
        usage: 'Randori sessions and their associated data',
      },
      {
        key: 'category-randori-container',
        value: 'tonal teal surface',
        usage: 'Randori badges and low-emphasis content',
      },
      {
        key: 'on-category-randori-container',
        value: 'contrast text',
        usage: 'Text and icons on Randori containers',
      },
      {
        key: 'category-shiai',
        value: 'violet / violet',
        usage: 'Shiai sessions and their associated data',
      },
      {
        key: 'category-shiai-container',
        value: 'tonal violet surface',
        usage: 'Shiai badges and low-emphasis content',
      },
      {
        key: 'on-category-shiai-container',
        value: 'contrast text',
        usage: 'Text and icons on Shiai containers',
      },
      {
        key: 'category-cardio',
        value: 'orange / orange',
        usage: 'Cardio sessions and their associated data',
      },
      {
        key: 'category-cardio-container',
        value: 'tonal orange surface',
        usage: 'Cardio badges and low-emphasis content',
      },
      {
        key: 'on-category-cardio-container',
        value: 'contrast text',
        usage: 'Text and icons on Cardio containers',
      },
      {
        key: 'category-strength-conditioning',
        value: 'rose / rose',
        usage: 'Strength & Conditioning sessions and their data',
      },
      {
        key: 'category-strength-conditioning-container',
        value: 'tonal rose surface',
        usage: 'Strength & Conditioning badges and content',
      },
      {
        key: 'on-category-strength-conditioning-container',
        value: 'contrast text',
        usage: 'Text and icons on Strength & Conditioning content',
      },
    ],
  },
  {
    heading: 'Surface & Background Tokens',
    description:
      'Layered background colors for creating depth and visual hierarchy.',
    tokens: [
      { key: 'surface', value: '#f7fafc', usage: 'App canvas/base background' },
      {
        key: 'surface-container-low',
        value: '#f1f4f6',
        usage: 'Section grouping backgrounds',
      },
      {
        key: 'surface-container-lowest',
        value: '#ffffff',
        usage: 'Cards and foreground modules',
      },
      {
        key: 'surface-container-high',
        value: '#e5e9eb',
        usage: 'Elevated neutral containers (secondary controls, skeletons)',
      },
      {
        key: 'surface-bright',
        value: '#f7fafc',
        usage: 'Active overlays and glass-like floating surfaces',
      },
      {
        key: 'surface-tint',
        value: '#006bab (light), #005faf (dark)',
        usage: 'Ambient interaction glow for elevated controls',
      },
      {
        key: 'surface-variant',
        value: '#e0e3e5',
        usage: 'Tracks, muted chart elements, neutral separators by tone',
      },
    ],
  },
  {
    heading: 'Text & Outline Tokens',
    description: 'Colors for typography and focus indicators.',
    tokens: [
      { key: 'on-surface', value: '#181c1e', usage: 'Primary body text/icons' },
      {
        key: 'on-surface-variant',
        value: '#43474a',
        usage: 'Secondary text, helper metadata',
      },
      {
        key: 'outline',
        value: '#73777a',
        usage: 'Focus/selection outlines requiring strong visibility',
      },
      {
        key: 'outline-variant',
        value: '#c2c7ca',
        usage: 'Subtle strokes for accessibility fallbacks',
      },
    ],
  },
  {
    heading: 'Status & Semantic Color Tokens',
    description:
      'Colors for communicating status, outcomes, and important information.',
    subsections: [
      {
        heading: 'Success',
        tokens: [
          {
            key: 'success',
            value: '#0f7a43',
            usage: 'Positive outcomes, successful states',
          },
          {
            key: 'success-container',
            value: '#d7f3e3',
            usage: 'Success banners, positive badge fills',
          },
          {
            key: 'on-success',
            value: '#ffffff',
            usage: 'Text/icons on `success`',
          },
          {
            key: 'on-success-container',
            value: '#0a4b2a',
            usage: 'Text/icons on `success-container`',
          },
        ],
      },
      {
        heading: 'Warning',
        tokens: [
          {
            key: 'warning',
            value: '#b26a00',
            usage: 'Cautionary messages, anomaly callouts',
          },
          {
            key: 'warning-container',
            value: '#ffe7c2',
            usage: 'Warning badges, caution background panels',
          },
          {
            key: 'on-warning',
            value: '#1f1600',
            usage: 'Text/icons on `warning`',
          },
          {
            key: 'on-warning-container',
            value: '#5c3a00',
            usage: 'Text/icons on `warning-container`',
          },
        ],
      },
      {
        heading: 'Error',
        tokens: [
          {
            key: 'error',
            value: '#c62828',
            usage: 'Error states, critical regressions',
          },
          {
            key: 'error-container',
            value: '#ffd9d6',
            usage: 'Error banners, destructive confirmation backgrounds',
          },
          { key: 'on-error', value: '#ffffff', usage: 'Text/icons on error' },
          {
            key: 'on-error-container',
            value: '#5f1313',
            usage: 'Text/icons on `error-container`',
          },
        ],
      },
      {
        heading: 'Info',
        tokens: [
          {
            key: 'info',
            value: '#00639b',
            usage: 'Informational notices, neutral status messaging',
          },
          {
            key: 'info-container',
            value: '#cde5ff',
            usage: 'Info callouts, non-critical status cards',
          },
          { key: 'on-info', value: '#ffffff', usage: 'Text/icons on info' },
          {
            key: 'on-info-container',
            value: '#0d3b66',
            usage: 'Text/icons on `info-container`',
          },
        ],
      },
    ],
  },
  {
    heading: 'Interactive State Tokens',
    description:
      'Colors for communicating button and control states during interaction.',
    subsections: [
      {
        heading: 'Primary Control States',
        tokens: [
          {
            key: 'primary-hover',
            value: '#D64C04 (light), #004f94 (dark)',
            usage: 'Hover state for primary controls',
          },
          {
            key: 'primary-pressed',
            value: '#C43D00 (light), #00437d (dark)',
            usage: 'Pressed/active state for primary',
          },
          {
            key: 'primary-focus',
            value: '#F39D6A (light), #66a3d9 (dark)',
            usage: 'Focus ring/accent for primary',
          },
          {
            key: 'primary-disabled',
            value: '#E8B3A0 (light), #9bbbd7 (dark)',
            usage: 'Disabled primary controls',
          },
        ],
      },
      {
        heading: 'Secondary Control States',
        tokens: [
          {
            key: 'secondary-hover',
            value: '#47556c',
            usage: 'Hover state for secondary controls',
          },
          {
            key: 'secondary-pressed',
            value: '#3d495d',
            usage: 'Pressed/active state for secondary',
          },
          {
            key: 'secondary-focus',
            value: '#8d9cb4',
            usage: 'Focus ring/accent for secondary',
          },
          {
            key: 'secondary-disabled',
            value: '#b4bcc8',
            usage: 'Disabled secondary controls',
          },
        ],
      },
    ],
  },
  {
    heading: 'Trend Indicator Tokens',
    description:
      'Colors for communicating positive, negative, and neutral trends in data visualization.',
    tokens: [
      {
        key: 'trend-positive',
        value: '#0f7a43',
        usage: 'Positive chart deltas, uptrend badges',
      },
      {
        key: 'trend-positive-container',
        value: '#d7f3e3',
        usage: 'Positive trend chip backgrounds',
      },
      {
        key: 'on-trend-positive-container',
        value: '#0a4b2a',
        usage: 'Text/icons on positive trend containers',
      },
      {
        key: 'trend-negative',
        value: '#c62828',
        usage: 'Negative chart deltas, regression badges',
      },
      {
        key: 'trend-negative-container',
        value: '#ffd9d6',
        usage: 'Negative trend chip backgrounds',
      },
      {
        key: 'on-trend-negative-container',
        value: '#5f1313',
        usage: 'Text/icons on negative trend containers',
      },
      {
        key: 'trend-neutral',
        value: '#6b7280',
        usage: 'Flat/no-change chart signals, badges',
      },
      {
        key: 'trend-neutral-container',
        value: '#e5e7eb',
        usage: 'Neutral trend chip backgrounds',
      },
      {
        key: 'on-trend-neutral-container',
        value: '#374151',
        usage: 'Text/icons on neutral trend containers',
      },
    ],
  },
] as const satisfies readonly DesignTokenGroup[];

type DesignTokenGroupLiteral = (typeof DESIGN_TOKEN_GROUPS)[number];
type DirectToken = DesignTokenGroupLiteral extends {
  tokens: readonly (infer Token)[];
}
  ? Token
  : never;
type SubsectionToken = DesignTokenGroupLiteral extends {
  subsections: readonly (infer Subsection)[];
}
  ? Subsection extends { tokens: readonly (infer Token)[] }
    ? Token
    : never
  : never;

export type CanonicalDesignTokenKey = DirectToken | SubsectionToken extends {
  key: infer Key extends string;
}
  ? Key
  : never;

export const CANONICAL_DESIGN_TOKEN_KEYS: readonly CanonicalDesignTokenKey[] = (
  DESIGN_TOKEN_GROUPS as readonly DesignTokenGroup[]
).flatMap(
  (group) =>
    group.tokens?.map((token) => token.key as CanonicalDesignTokenKey) ??
    group.subsections?.flatMap((subsection) =>
      subsection.tokens.map((token) => token.key as CanonicalDesignTokenKey)
    ) ??
    []
);

export const LEGACY_DESIGN_TOKEN_MAPPINGS = {
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
  on_primary_fixed: 'on-primary-fixed',
} as const satisfies Readonly<Record<string, CanonicalDesignTokenKey>>;
