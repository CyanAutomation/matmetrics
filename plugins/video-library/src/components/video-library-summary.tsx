import {
  PluginStatCard,
  PluginStatsGrid,
} from '@/components/plugins/plugin-stats-grid';

export function VideoLibrarySummary({
  attached,
  missing,
  review,
  checked,
}: {
  attached: number;
  missing: number;
  review: number;
  checked: number;
}) {
  return (
    <PluginStatsGrid>
      <PluginStatCard label="Videos attached" value={attached} />
      <PluginStatCard
        label="Sessions without video (optional)"
        value={missing}
      />
      <PluginStatCard label="Needs review" value={review} />
      <PluginStatCard label="Checked links" value={checked} />
    </PluginStatsGrid>
  );
}
