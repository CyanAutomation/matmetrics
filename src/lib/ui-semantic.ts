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

export type DashboardChartToken = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4';

const dashboardCategoryChartToken: Partial<Record<
  SessionCategory,
  DashboardChartToken
>> = {
  Technical: 'chart-1',
  Randori: 'chart-2',
  Shiai: 'chart-3',
};

const dashboardCategoryFallbackChartToken: DashboardChartToken = 'chart-4';

const dashboardChartTokenBarClass: Record<DashboardChartToken, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
};

export function resolveDashboardCategoryChartToken(
  categoryName: string
): DashboardChartToken {
  return (
    dashboardCategoryChartToken[categoryName as SessionCategory] ??
    dashboardCategoryFallbackChartToken
  );
}

export function resolveDashboardCategoryBarClass(categoryName: string): string {
  return dashboardChartTokenBarClass[
    resolveDashboardCategoryChartToken(categoryName)
  ];
}
