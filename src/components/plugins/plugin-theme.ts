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
    warningTone: 'ui-tone-inline-warning',
    surfaceElevation: 'shadow-sm',
    inlineMessageToneVariant: 'tone.inline.default',
    inputTone: 'border-input focus:border-ring',
  },
  info: {
    headerIconBg: 'bg-primary text-primary-foreground',
    noticeBorder: 'border-primary/25',
    noticeBg: 'bg-primary/5',
    noticeText: 'text-primary',
    warningTone: 'ui-tone-inline-warning',
    surfaceElevation: 'shadow-md',
    inlineMessageToneVariant: 'tone.inline.info',
    inputTone: 'border-primary/25 focus:border-primary/45',
  },
  warning: {
    headerIconBg: 'ui-tone-inline-warning',
    noticeBorder: 'border-[hsl(var(--color-warning)/0.35)]',
    noticeBg: 'bg-[hsl(var(--color-warning-container))]',
    noticeText: 'text-[hsl(var(--color-on-warning-container))]',
    warningTone: 'ui-tone-inline-warning',
    surfaceElevation: 'shadow-sm',
    inlineMessageToneVariant: 'tone.inline.warning',
    inputTone:
      'border-[hsl(var(--color-warning)/0.35)] focus:border-[hsl(var(--color-warning)/0.55)]',
  },
  success: {
    headerIconBg: 'ui-tone-inline-success',
    noticeBorder: 'border-[hsl(var(--color-success)/0.35)]',
    noticeBg: 'bg-[hsl(var(--color-success-container))]',
    noticeText: 'text-[hsl(var(--color-on-success-container))]',
    warningTone: 'ui-tone-inline-warning',
    surfaceElevation: 'shadow-sm',
    inlineMessageToneVariant: 'tone.inline.success',
    inputTone:
      'border-[hsl(var(--color-success)/0.35)] focus:border-[hsl(var(--color-success)/0.6)]',
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
