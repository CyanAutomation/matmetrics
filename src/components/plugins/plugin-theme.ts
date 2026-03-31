import {
  getPluginUiTokenClassNames,
  type PluginUiContractTokenVariant,
} from '@/components/plugins/plugin-style-policy';

export type PluginThemeTone =
  | 'default'
  | 'info'
  | 'warning'
  | 'success'
  | 'error';

export type PluginThemeSlots = {
  headerIconBg: string;
  noticeBorder: string;
  noticeBg: string;
  noticeText: string;
  warningTone: string;
  surfaceElevation: string;
  inlineMessageToneVariant: PluginUiContractTokenVariant;
  inputTone: string;
};

const PLUGIN_THEME_TOKEN_MAP: Record<PluginThemeTone, PluginThemeSlots> = {
  default: {
    headerIconBg: 'bg-muted text-foreground',
    noticeBorder: 'border-border',
    noticeBg: 'bg-muted/30',
    noticeText: 'text-foreground',
    warningTone: 'border-amber-200 bg-amber-50 text-amber-900',
    surfaceElevation: 'shadow-sm',
    inlineMessageToneVariant: 'tone.inline.default',
    inputTone: 'border-input focus:border-ring',
  },
  info: {
    headerIconBg: 'bg-primary text-primary-foreground',
    noticeBorder: 'border-primary/25',
    noticeBg: 'bg-primary/5',
    noticeText: 'text-primary',
    warningTone: 'border-amber-200 bg-amber-50 text-amber-900',
    surfaceElevation: 'shadow-md',
    inlineMessageToneVariant: 'tone.inline.info',
    inputTone: 'border-primary/25 focus:border-primary/45',
  },
  warning: {
    headerIconBg: 'bg-amber-100 text-amber-900',
    noticeBorder: 'border-amber-300',
    noticeBg: 'bg-amber-50',
    noticeText: 'text-amber-900',
    warningTone: 'border-amber-300 bg-amber-50 text-amber-900',
    surfaceElevation: 'shadow-sm',
    inlineMessageToneVariant: 'tone.inline.warning',
    inputTone: 'border-amber-300 focus:border-amber-400',
  },
  success: {
    headerIconBg: 'bg-emerald-100 text-emerald-900',
    noticeBorder: 'border-emerald-300',
    noticeBg: 'bg-emerald-50',
    noticeText: 'text-emerald-900',
    warningTone: 'border-amber-200 bg-amber-50 text-amber-900',
    surfaceElevation: 'shadow-sm',
    inlineMessageToneVariant: 'tone.inline.success',
    inputTone: 'border-emerald-300 focus:border-emerald-500',
  },
  error: {
    headerIconBg: 'bg-destructive/15 text-destructive',
    noticeBorder: 'border-destructive/30',
    noticeBg: 'bg-destructive/10',
    noticeText: 'text-destructive',
    warningTone: 'border-destructive/30 bg-destructive/10 text-destructive',
    surfaceElevation: 'shadow-sm',
    inlineMessageToneVariant: 'tone.inline.error',
    inputTone: 'border-destructive/30 focus:border-destructive/50',
  },
};

export function getPluginThemeTokens(
  tone: PluginThemeTone = 'default'
): PluginThemeSlots & { inlineMessageTone: string } {
  const tokens = PLUGIN_THEME_TOKEN_MAP[tone];

  return {
    ...tokens,
    inlineMessageTone: getPluginUiTokenClassNames(
      tokens.inlineMessageToneVariant
    ),
  };
}
