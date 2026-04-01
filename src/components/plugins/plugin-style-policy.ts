export const PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST = [
  'bg-amber-50',
  'bg-amber-100',
  'bg-emerald-50',
  'bg-emerald-100',
  'border-amber-200',
  'border-amber-300',
  'border-emerald-300',
  'text-amber-900',
  'text-emerald-900',
] as const;

export const PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP = {
  'layout.standard': ['max-w-4xl'],
  'layout.wide': ['max-w-6xl'],
  'surface.github-sync': ['bg-primary/5', 'border-primary/25'],
  'surface.prompt-settings': ['bg-card/95', 'border-primary/20'],
  'surface.tag-manager': ['bg-card/95', 'bg-primary'],
  'surface.video-library': ['bg-card/95', 'text-muted-foreground'],
  'surface.log-doctor': ['bg-secondary/20', 'border-ghost'],
  'surface.filter-panel': ['rounded-md', 'border', 'p-3'],
  'surface.diff-preview': ['bg-muted', 'border'],
  'layout.filter-bar': ['grid', 'gap-3'],
  'layout.action-row': ['flex', 'flex-wrap', 'gap-2'],
  'layout.action-row.trailing': ['ml-auto'],
  'tone.inline.default': ['border-border', 'bg-muted/30', 'text-foreground'],
  'tone.inline.info': ['border-primary/25', 'bg-primary/5', 'text-primary'],
  'tone.inline.warning': ['border-amber-300', 'bg-amber-50', 'text-amber-900'],
  'tone.inline.success': [
    'border-emerald-300',
    'bg-emerald-50',
    'text-emerald-900',
  ],
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
  'text.success': ['text-emerald-900'],
  'icon.subtle': ['text-muted-foreground'],
  'icon.info': ['text-primary'],
  'icon.success': ['text-emerald-900'],
  'code.inline': ['rounded', 'bg-background/70', 'px-2', 'py-1'],
} as const;

export type PluginUiContractTokenVariant =
  keyof typeof PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP;

export function getPluginUiTokenClassNames(
  variant: PluginUiContractTokenVariant
): string {
  return PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP[variant].join(' ');
}
