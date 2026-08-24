import type {
  PluginMaturityTier,
  PluginValidationSeverity,
} from '@/lib/plugins/types';
import type { SessionCategory } from '@/lib/types';

export const pluginSeverityToneClass: Record<PluginValidationSeverity, string> =
  {
    error: 'ui-pill-error',
    warning: 'ui-pill-warning',
    info: 'ui-pill-info',
  };

export function resolvePluginSeverityToneClass(severity: string): string {
  if (!Object.hasOwn(pluginSeverityToneClass, severity)) {
    throw new RangeError(`Unsupported plugin severity: ${severity}`);
  }

  return pluginSeverityToneClass[severity as PluginValidationSeverity];
}

const pluginTierToneClass: Record<PluginMaturityTier, string> = {
  bronze: 'ui-pill-warning',
  silver: 'ui-pill-trend-neutral',
  gold: 'ui-pill-trend-positive',
};

export function resolvePluginTierPresentation(tier: PluginMaturityTier): {
  label: string;
  toneClass: string;
} {
  return {
    label: tier.charAt(0).toUpperCase() + tier.slice(1),
    toneClass: pluginTierToneClass[tier],
  };
}

export type DashboardChartToken =
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5';

export type SessionCategoryTone =
  | 'technical'
  | 'randori'
  | 'shiai'
  | 'cardio'
  | 'strengthConditioning'
  | 'fallback';

const sessionCategoryTone: Partial<
  Record<SessionCategory, SessionCategoryTone>
> = {
  Technical: 'technical',
  Randori: 'randori',
  Shiai: 'shiai',
  Cardio: 'cardio',
  'S&C': 'strengthConditioning',
};

const sessionCategoryPresentation: Record<
  SessionCategoryTone,
  { barClass: string; dotClass: string; badgeVariant: SessionCategoryTone }
> = {
  technical: {
    // These classes are safelisted because this presentation map lives outside
    // Tailwind's content glob. Keep the dashboard and plan indicators visible
    // in production builds as well as development.
    barClass: 'bg-chart-1',
    dotClass: 'bg-chart-1',
    badgeVariant: 'technical',
  },
  randori: {
    barClass: 'bg-chart-2',
    dotClass: 'bg-chart-2',
    badgeVariant: 'randori',
  },
  shiai: {
    barClass: 'bg-chart-3',
    dotClass: 'bg-chart-3',
    badgeVariant: 'shiai',
  },
  cardio: {
    barClass: 'bg-chart-4',
    dotClass: 'bg-chart-4',
    badgeVariant: 'cardio',
  },
  strengthConditioning: {
    barClass: 'bg-chart-5',
    dotClass: 'bg-chart-5',
    badgeVariant: 'strengthConditioning',
  },
  fallback: {
    barClass: 'bg-chart-4',
    dotClass: 'bg-chart-4',
    badgeVariant: 'fallback',
  },
};

export function resolveSessionCategoryTone(
  categoryName: string
): SessionCategoryTone {
  return sessionCategoryTone[categoryName as SessionCategory] ?? 'fallback';
}

export function resolveSessionCategoryPresentation(categoryName: string) {
  return sessionCategoryPresentation[resolveSessionCategoryTone(categoryName)];
}

const dashboardCategoryChartToken: Partial<
  Record<SessionCategory, DashboardChartToken>
> = {
  Technical: 'chart-1',
  Randori: 'chart-2',
  Shiai: 'chart-3',
  Cardio: 'chart-4',
  'S&C': 'chart-5',
};

const dashboardCategoryFallbackChartToken: DashboardChartToken = 'chart-4';

export function resolveDashboardCategoryChartToken(
  categoryName: string
): DashboardChartToken {
  return (
    dashboardCategoryChartToken[categoryName as SessionCategory] ??
    dashboardCategoryFallbackChartToken
  );
}

export function resolveDashboardCategoryBarClass(categoryName: string): string {
  return resolveSessionCategoryPresentation(categoryName).barClass;
}

export function resolveDashboardTechniqueBarClass(index: number): string {
  return (
    ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-primary/60'][
      index
    ] ?? 'bg-chart-4'
  );
}
