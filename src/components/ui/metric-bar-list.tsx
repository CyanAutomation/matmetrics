import { cn } from '@/lib/utils';

export type MetricBarListItem = {
  label: string;
  value: number;
  valueLabel?: string;
  barClassName?: string;
};

type MetricBarListProps = {
  items: MetricBarListItem[];
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
};

/** A compact, reusable ranked metric treatment for dashboard summaries. */
export function MetricBarList({
  items,
  ariaLabel,
  className,
  itemClassName,
}: MetricBarListProps) {
  const maximum = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul aria-label={ariaLabel} className={cn('space-y-3', className)}>
      {items.map((item) => {
        const width = `${Number(((item.value / maximum) * 100).toFixed(4))}%`;
        return (
          <li key={item.label} className={cn('min-w-0', itemClassName)}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium leading-none">
                {item.label}
              </span>
              <span className="shrink-0 text-body-sm font-semibold text-muted-foreground tabular-nums">
                {item.valueLabel ?? item.value}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                data-slot="metric-bar"
                className={cn('h-full rounded-full', item.barClassName)}
                style={{ width }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
