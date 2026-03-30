export const PLUGIN_SAFE_UTILITY_CLASS_ALLOWLIST = [
  'bg-amber-50',
  'bg-amber-100',
  'border-amber-200',
  'border-amber-300',
  'text-amber-900',
] as const;

export const PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP = {
  'layout.standard': ['max-w-4xl'],
  'layout.wide': ['max-w-6xl'],
  'surface.githubSync': ['bg-primary/5', 'border-primary/25'],
  'surface.promptSettings': ['bg-card/95', 'border-primary/20'],
  'surface.tagManager': ['bg-card/95', 'bg-primary'],
  'surface.videoLibrary': ['bg-card/95', 'text-muted-foreground'],
  'surface.logDoctor': ['bg-secondary/20', 'border-ghost'],
} as const;

export type PluginUiContractTokenVariant =
  keyof typeof PLUGIN_UI_CONTRACT_TOKEN_VARIANT_CLASS_MAP;
