export const PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST = [
  'ui-tone-inline-warning',
  'ui-tone-inline-success',
  'ui-tone-warning-soft',
  'ui-tone-success-soft',
] as const;

export const PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP = {
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
  'action.destructive': [
    'border-destructive/40',
    'text-destructive',
    'hover:bg-destructive/10',
  ],
  'action.subtle': ['text-muted-foreground', 'hover:text-foreground'],
  'text.subtle': ['text-muted-foreground'],
  'text.danger': ['text-destructive'],
  'text.success': ['text-[hsl(var(--color-on-success-container))]'],
  'icon.subtle': ['text-muted-foreground'],
  'icon.info': ['text-primary'],
  'icon.success': ['text-[hsl(var(--color-on-success-container))]'],
  'code.inline': ['rounded', 'bg-background/70', 'px-2', 'py-1'],
} as const;

const PLUGIN_THEME_TONE_ALLOWLIST = [
  'bg-muted',
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
