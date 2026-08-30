export const PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST = [
  'ui-tone-inline-warning',
  'ui-tone-inline-success',
  'ui-tone-warning-soft',
  'ui-tone-success-soft',
  'ui-pill-error',
  'ui-pill-warning',
  'ui-pill-info',
  'ui-pill-trend-neutral',
  'ui-pill-trend-positive',
] as const;

const PLUGIN_UI_CONTRACT_TOKEN_CLASS_ALLOWLIST = [
  'max-w-4xl',
  'max-w-6xl',
  'bg-card/95',
  'border-border',
  'rounded-md',
  'border',
  'p-3',
  'bg-muted',
  'grid',
  'gap-3',
  'flex',
  'flex-wrap',
  'gap-2',
  'ml-auto',
  'bg-muted/30',
  'text-foreground',
  'border-primary/25',
  'bg-primary/5',
  'text-primary',
  'border-destructive/30',
  'bg-destructive/10',
  'text-destructive',
  'border-primary/20',
  'hover:bg-primary/5',
  'hover:bg-primary/10',
  'border-[hsl(var(--color-warning)/0.35)]',
  'bg-[hsl(var(--color-warning-container))]',
  'text-[hsl(var(--color-on-warning-container))]',
  'hover:brightness-95',
  'border-destructive/40',
  'hover:bg-destructive/10',
  'text-muted-foreground',
  'hover:text-foreground',
  'focus:text-destructive',
  'hover:bg-muted',
  'text-[hsl(var(--color-on-success-container))]',
  'rounded',
  'bg-background/70',
  'px-2',
  'py-1',
] as const;

const pluginUiContractTokenVariantClassMap = {
  'layout.standard': ['max-w-4xl'],
  'layout.wide': ['max-w-6xl'],
  'surface.github-sync': ['bg-card/95', 'border-border'],
  'surface.prompt-settings': ['bg-card/95', 'border-border'],
  'surface.tag-manager': ['bg-card/95', 'border-border'],
  'surface.video-library': ['bg-card/95', 'border-border'],
  'surface.log-doctor': ['bg-card/95', 'border-border'],
  'surface.filter-panel': ['rounded-md', 'border', 'p-3'],
  'surface.diff-preview': ['bg-muted', 'border'],
  'layout.filter-bar': ['grid', 'gap-3'],
  'layout.action-row': ['flex', 'flex-wrap', 'gap-2'],
  'layout.action-row.trailing': ['ml-auto'],
  'tone.inline.default': ['border-border', 'bg-muted/30', 'text-foreground'],
  'tone.inline.info': ['border-primary/25', 'bg-primary/5', 'text-primary'],
  'tone.inline.warning': ['ui-tone-inline-warning'],
  'tone.inline.success': ['ui-tone-inline-success'],
  'tone.inline.error': [
    'border-destructive/30',
    'bg-destructive/10',
    'text-destructive',
  ],
  'action.secondary': [
    'border-primary/20',
    'text-primary',
    'hover:bg-primary/5',
  ],
  'action.primary': [
    'border-primary/20',
    'bg-primary/5',
    'text-primary',
    'hover:bg-primary/10',
  ],
  'action.warning': [
    'border-[hsl(var(--color-warning)/0.35)]',
    'bg-[hsl(var(--color-warning-container))]',
    'text-[hsl(var(--color-on-warning-container))]',
    'hover:brightness-95',
  ],
  'action.destructive': [
    'border-destructive/40',
    'text-destructive',
    'hover:bg-destructive/10',
  ],
  'action.subtle': ['text-muted-foreground', 'hover:text-foreground'],
  'action.destructive-menu-item': [
    'text-destructive',
    'focus:text-destructive',
  ],
  'tab.inactive': [
    'text-muted-foreground',
    'hover:bg-muted',
    'hover:text-foreground',
  ],
  'text.subtle': ['text-muted-foreground'],
  'text.danger': ['text-destructive'],
  'text.success': ['text-[hsl(var(--color-on-success-container))]'],
  'icon.subtle': ['text-muted-foreground'],
  'icon.info': ['text-primary'],
  'icon.success': ['text-[hsl(var(--color-on-success-container))]'],
  'code.inline': ['rounded', 'bg-background/70', 'px-2', 'py-1'],
} as const;

export type PluginUiSemanticRole =
  | 'layout'
  | 'surface'
  | 'tone'
  | 'action'
  | 'tab'
  | 'text'
  | 'icon'
  | 'code';

export const PLUGIN_UI_REQUIRED_VARIANT_SEMANTIC_ROLE_MAP = {
  'layout.standard': 'layout',
  'layout.wide': 'layout',
  'surface.github-sync': 'surface',
  'surface.prompt-settings': 'surface',
  'surface.tag-manager': 'surface',
  'surface.video-library': 'surface',
  'surface.log-doctor': 'surface',
  'surface.filter-panel': 'surface',
  'surface.diff-preview': 'surface',
  'layout.filter-bar': 'layout',
  'layout.action-row': 'layout',
  'layout.action-row.trailing': 'layout',
  'tone.inline.default': 'tone',
  'tone.inline.info': 'tone',
  'tone.inline.warning': 'tone',
  'tone.inline.success': 'tone',
  'tone.inline.error': 'tone',
  'action.secondary': 'action',
  'action.primary': 'action',
  'action.warning': 'action',
  'action.destructive': 'action',
  'action.subtle': 'action',
  'action.destructive-menu-item': 'action',
  'tab.inactive': 'tab',
  'text.subtle': 'text',
  'text.danger': 'text',
  'text.success': 'text',
  'icon.subtle': 'icon',
  'icon.info': 'icon',
  'icon.success': 'icon',
  'code.inline': 'code',
} as const satisfies Record<string, PluginUiSemanticRole>;

const PLUGIN_THEME_TONE_ALLOWLIST = [
  'bg-muted',
  'bg-muted/20',
  'bg-muted/30',
  'bg-primary',
  'bg-primary/5',
  'bg-destructive/15',
  'bg-destructive/10',
  'text-foreground',
  'text-primary-foreground',
  'text-primary',
  'text-destructive',
  'border-border',
  'border-primary/25',
  'border-destructive/30',
  'border-input',
  'focus:border-ring',
  'focus:border-primary/45',
  'focus:border-destructive/50',
  'border-[hsl(var(--color-warning)/0.35)]',
  'bg-[hsl(var(--color-warning-container))]',
  'text-[hsl(var(--color-on-warning-container))]',
  'focus:border-[hsl(var(--color-warning)/0.55)]',
  'border-[hsl(var(--color-success)/0.35)]',
  'bg-[hsl(var(--color-success-container))]',
  'text-[hsl(var(--color-on-success-container))]',
  'focus:border-[hsl(var(--color-success)/0.6)]',
  'shadow-sm',
  'shadow-md',
] as const;

export interface PluginStylePolicyValidationOptions {
  recognizedTokens?: ReadonlySet<string>;
  requiredVariantRoles?: Readonly<Record<string, PluginUiSemanticRole>>;
}

const forbiddenRawColorClassPattern =
  /^(?:[a-z0-9_-]+:)*(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?$/;

export function validatePluginUiTokenVariants(
  variants: Readonly<Record<string, readonly string[]>>,
  options: PluginStylePolicyValidationOptions = {}
): void {
  const recognizedTokens =
    options.recognizedTokens ??
    new Set([
      ...PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST,
      ...PLUGIN_UI_CONTRACT_TOKEN_CLASS_ALLOWLIST,
      ...PLUGIN_THEME_TONE_ALLOWLIST,
    ]);
  const requiredVariantRoles =
    options.requiredVariantRoles ??
    PLUGIN_UI_REQUIRED_VARIANT_SEMANTIC_ROLE_MAP;

  for (const [variant, tokens] of Object.entries(variants)) {
    if (tokens.length === 0) {
      throw new Error(`Plugin UI variant "${variant}" must contain tokens`);
    }

    const seen = new Set<string>();
    for (const token of tokens) {
      if (token.length === 0 || /\s/.test(token)) {
        throw new Error(
          `Plugin UI variant "${variant}" contains a non-normalized token: "${token}"`
        );
      }
      if (seen.has(token)) {
        throw new Error(
          `Plugin UI variant "${variant}" contains duplicate token: "${token}"`
        );
      }
      if (forbiddenRawColorClassPattern.test(token)) {
        throw new Error(
          `Plugin UI variant "${variant}" contains forbidden raw color token: "${token}"`
        );
      }
      if (!recognizedTokens.has(token)) {
        throw new Error(
          `Plugin UI variant "${variant}" contains unknown policy token: "${token}"`
        );
      }
      seen.add(token);
    }
  }

  for (const [variant, expectedRole] of Object.entries(requiredVariantRoles)) {
    if (!(variant in variants)) {
      throw new Error(
        `Plugin UI policy is missing required ${expectedRole} variant "${variant}"`
      );
    }
    if (variant.split('.')[0] !== expectedRole) {
      throw new Error(
        `Plugin UI variant "${variant}" must map to semantic role "${expectedRole}"`
      );
    }
  }
}

validatePluginUiTokenVariants(pluginUiContractTokenVariantClassMap);

export const PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP =
  pluginUiContractTokenVariantClassMap;

export type PluginUiContractTokenVariant =
  keyof typeof PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP;

export function getPluginUiTokenClassNames(
  variant: PluginUiContractTokenVariant
): string {
  return PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP[variant].join(' ');
}

export function derivePluginAllowedClassTokens(): Set<string> {
  return new Set([
    ...PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST,
    ...Object.values(PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP).flat(),
    ...PLUGIN_THEME_TONE_ALLOWLIST,
  ]);
}
