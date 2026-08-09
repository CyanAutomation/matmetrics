import type { ChartConfig } from './chart-types';
import { CHART_THEMES } from './chart-types';

export const ChartStyle = ({
  id,
  config,
}: {
  id: string;
  config: ChartConfig;
}) => {
  const styleConfig = Object.entries(config).filter(
    ([, itemConfig]) =>
      itemConfig.theme ||
      itemConfig.color ||
      itemConfig.markerShape ||
      itemConfig.strokeStyle
  );

  if (!styleConfig.length) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(CHART_THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${styleConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color;
    return [
      color ? `  --color-${key}: ${color};` : null,
      itemConfig.markerShape
        ? `  --marker-${key}: ${itemConfig.markerShape};`
        : null,
      itemConfig.strokeStyle
        ? `  --stroke-${key}: ${itemConfig.strokeStyle};`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  })
  .filter(Boolean)
  .join('\n')}
}
`
          )
          .join('\n'),
      }}
    />
  );
};
