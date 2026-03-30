export type PluginThemeTone = 'default' | 'info' | 'warning';

export type PluginThemeSlots = {
  headerIconBg: string;
  noticeBorder: string;
  noticeBg: string;
  noticeText: string;
  warningTone: string;
  surfaceElevation: string;
};

const PLUGIN_THEME_TOKEN_MAP: Record<PluginThemeTone, PluginThemeSlots> = {
  default: {
    headerIconBg: 'bg-muted text-foreground',
    noticeBorder: 'border-border',
    noticeBg: 'bg-muted/30',
    noticeText: 'text-foreground',
    warningTone: 'border-amber-200 bg-amber-50 text-amber-900',
    surfaceElevation: 'shadow-sm',
  },
  info: {
    headerIconBg: 'bg-primary text-primary-foreground',
    noticeBorder: 'border-primary/25',
    noticeBg: 'bg-primary/5',
    noticeText: 'text-primary',
    warningTone: 'border-amber-200 bg-amber-50 text-amber-900',
    surfaceElevation: 'shadow-md',
  },
  warning: {
    headerIconBg: 'bg-amber-100 text-amber-900',
    noticeBorder: 'border-amber-300',
    noticeBg: 'bg-amber-50',
    noticeText: 'text-amber-900',
    warningTone: 'border-amber-300 bg-amber-50 text-amber-900',
    surfaceElevation: 'shadow-sm',
  },
};

export function getPluginThemeTokens(
  tone: PluginThemeTone = 'default'
): PluginThemeSlots {
  return PLUGIN_THEME_TOKEN_MAP[tone];
}
