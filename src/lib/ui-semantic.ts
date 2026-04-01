import type {
  PluginMaturityTier,
  PluginValidationSeverity,
} from '@/lib/plugins/types';

export const pluginSeverityToneClass: Record<PluginValidationSeverity, string> =
  {
    error: 'ui-pill-error',
    warning: 'ui-pill-warning',
    info: 'ui-pill-info',
  };

export const pluginTierToneClass: Record<PluginMaturityTier, string> = {
  bronze: 'ui-pill-warning',
  silver: 'ui-pill-trend-neutral',
  gold: 'ui-pill-trend-positive',
};

export const dashboardCategoryBarClass: Record<string, string> = {
  Technical: 'bg-[hsl(var(--chart-1))]',
  Randori: 'bg-[hsl(var(--chart-2))]',
  Shiai: 'bg-[hsl(var(--chart-3))]',
};

export function resolveDashboardCategoryBarClass(categoryName: string): string {
  return dashboardCategoryBarClass[categoryName] ?? 'bg-[hsl(var(--chart-4))]';
}
