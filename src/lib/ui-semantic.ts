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
  Bronze: 'ui-pill-warning',
  Silver: 'ui-pill-trend-neutral',
  Gold: 'ui-pill-trend-positive',
};

const dashboardCategoryBarClass: Record<string, string> = {
  Technical: 'bg-[hsl(var(--chart-1))]',
  Randori: 'bg-[hsl(var(--chart-2))]',
  Shiai: 'bg-[hsl(var(--chart-3))]',
};

export function resolveDashboardCategoryBarClass(categoryName: string): string {
  return dashboardCategoryBarClass[categoryName] ?? 'bg-[hsl(var(--chart-4))]';
}
