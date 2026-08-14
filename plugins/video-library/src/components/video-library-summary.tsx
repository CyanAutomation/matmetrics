import {
  PluginStatCard,
  PluginStatsGrid,
} from '@/components/plugins/plugin-stats-grid';

export function VideoLibrarySummary({
  total,
  attached,
  missing,
  review,
  checked,
}: {
  total: number;
  attached: number;
  missing: number;
  review: number;
  checked: number;
}) {
  return (
    <PluginStatsGrid>
      <PluginStatCard
        label={`Sessions with video (of ${total})`}
        value={attached}
      />
      <PluginStatCard
        label={`Sessions without video (of ${total})`}
        value={missing}
      />
      <PluginStatCard label="Needs review" value={review} />
      <PluginStatCard label="Checked links" value={checked} />
    </PluginStatsGrid>
  );
}
