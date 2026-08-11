'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import type {
  ValueType as RechartsValueType,
  NameType as RechartsNameType,
  Payload as RechartsPayload,
} from 'recharts/types/component/DefaultTooltipContent';

import { cn } from '@/lib/utils';
import { useChart } from './chart-context';
import type { ChartConfig } from './chart-types';

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== 'object' || payload === null) return undefined;

  const payloadPayload =
    'payload' in payload &&
    typeof payload.payload === 'object' &&
    payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey = key;
  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === 'string'
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === 'string'
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string;
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config];
}

type ChartTooltipItem = RechartsPayload<
  RechartsValueType,
  RechartsNameType
>;

type ChartTooltipContentProps = Omit<
  React.ComponentProps<typeof RechartsPrimitive.Tooltip>,
  'formatter'
> &
  React.ComponentProps<'div'> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: 'line' | 'dot' | 'dashed';
    nameKey?: string;
    labelKey?: string;
    formatter?: (
      value: RechartsValueType,
      name: RechartsNameType,
      item: ChartTooltipItem,
      index: number,
      payload: Record<string, unknown>
    ) => React.ReactNode;
    valueUnit?: string;
    dateKey?: string;
    timestampKey?: string;
    deltaKey?: string;
    detailFormatter?: (item: {
      seriesKey: string;
      seriesLabel: React.ReactNode;
      value: number | string;
      valueWithUnit: string;
      date?: string;
      timestamp?: string;
      delta?: number | string;
      payload: Record<string, unknown>;
      index: number;
    }) => React.ReactNode;
  };

function getRawTooltipValue(value: RechartsValueType | undefined) {
  return typeof value === 'number' || typeof value === 'string' ? value : '';
}

function getTooltipLabel(
  config: ChartConfig,
  item: ChartTooltipItem,
  label: RechartsNameType,
  labelKey?: string
) {
  const key = `${labelKey || item.dataKey || item.name || 'value'}`;
  const itemConfig = getPayloadConfigFromPayload(config, item, key);

  return !labelKey && typeof label === 'string'
    ? config[label as keyof typeof config]?.label || label
    : itemConfig?.label;
}

function renderTooltipLabel(
  value: React.ReactNode,
  labelFormatter: NonNullable<
    React.ComponentProps<typeof RechartsPrimitive.Tooltip>['labelFormatter']
  > | undefined,
  payload: ChartTooltipItem[],
  className?: string
) {
  if (labelFormatter) {
    return (
      <div className={cn('font-medium', className)}>
        {labelFormatter(value, payload)}
      </div>
    );
  }

  return value ? (
    <div className={cn('font-medium', className)}>{value}</div>
  ) : null;
}

function getTooltipDetail(
  item: ChartTooltipItem,
  index: number,
  config: ChartConfig,
  nameKey: string | undefined,
  valueUnit: string | undefined,
  dateKey: string,
  timestampKey: string,
  deltaKey: string
) {
  const key = `${nameKey || item.name || item.dataKey || 'value'}`;
  const itemConfig = getPayloadConfigFromPayload(config, item, key);
  const rawValue = getRawTooltipValue(item.value);
  const typedPayload = (item.payload || {}) as Record<string, unknown>;

  return {
    key,
    itemConfig,
    rawValue,
    valueWithUnit: [rawValue, valueUnit].filter(Boolean).join(' '),
    typedPayload,
    date:
      typeof typedPayload[dateKey] === 'string'
        ? typedPayload[dateKey]
        : undefined,
    timestamp:
      typeof typedPayload[timestampKey] === 'string'
        ? typedPayload[timestampKey]
        : undefined,
    delta:
      typeof typedPayload[deltaKey] === 'number' ||
      typeof typedPayload[deltaKey] === 'string'
        ? typedPayload[deltaKey]
        : undefined,
    index,
  };
}

function TooltipIndicator({
  color,
  indicator,
  hideIndicator,
  nestLabel,
}: {
  color: string | number | undefined;
  indicator: 'line' | 'dot' | 'dashed';
  hideIndicator: boolean;
  nestLabel: boolean;
}) {
  if (hideIndicator) return null;

  return (
    <div
      className={cn(
        'shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]',
        {
          'h-2.5 w-2.5': indicator === 'dot',
          'w-1': indicator === 'line',
          'w-0 border-[1.5px] border-dashed bg-transparent':
            indicator === 'dashed',
          'my-0.5': nestLabel && indicator === 'dashed',
        }
      )}
      style={
        {
          '--color-bg': color,
          '--color-border': color,
        } as React.CSSProperties
      }
    />
  );
}

function TooltipDefaultItem({
  item,
  itemConfig,
  valueWithUnit,
  tooltipLabel,
  indicator,
  hideIndicator,
  nestLabel,
  indicatorColor,
}: {
  item: ChartTooltipItem;
  itemConfig: ChartConfig[string] | undefined;
  valueWithUnit: string;
  tooltipLabel: React.ReactNode;
  indicator: 'line' | 'dot' | 'dashed';
  hideIndicator: boolean;
  nestLabel: boolean;
  indicatorColor: string | number | undefined;
}) {
  return (
    <>
      {itemConfig?.icon ? (
        <itemConfig.icon />
      ) : (
        <TooltipIndicator
          color={indicatorColor}
          indicator={indicator}
          hideIndicator={hideIndicator}
          nestLabel={nestLabel}
        />
      )}
      <div
        className={cn(
          'flex flex-1 justify-between leading-none',
          nestLabel ? 'items-end' : 'items-center'
        )}
      >
        <div className="grid gap-1.5">
          {nestLabel ? tooltipLabel : null}
          <span className="text-muted-foreground">
            {itemConfig?.label || item.name}
          </span>
        </div>
        {item.value !== undefined && item.value !== null ? (
          <span className="font-mono font-medium tabular-nums text-foreground">
            {valueWithUnit || item.value.toLocaleString()}
          </span>
        ) : null}
      </div>
    </>
  );
}

function renderTooltipItemContent({
  item,
  detail,
  detailFormatter,
  formatter,
  defaultContent,
}: {
  item: ChartTooltipItem;
  detail: ReturnType<typeof getTooltipDetail>;
  detailFormatter?: ChartTooltipContentProps['detailFormatter'];
  formatter?: ChartTooltipContentProps['formatter'];
  defaultContent: React.ReactNode;
}) {
  const detailNode = detailFormatter?.({
    seriesKey: detail.key,
    seriesLabel: detail.itemConfig?.label || item.name || detail.key,
    value: detail.rawValue,
    valueWithUnit: detail.valueWithUnit,
    date: detail.date,
    timestamp: detail.timestamp,
    delta: detail.delta,
    payload: detail.typedPayload,
    index: detail.index,
  });

  if (detailNode) return detailNode;
  if (formatter && item.value !== undefined && item.name) {
    return formatter(item.value, item.name, item, detail.index, item.payload);
  }
  return defaultContent;
}

function ChartTooltipItem({
  item,
  index,
  config,
  color,
  indicator,
  hideIndicator,
  nestLabel,
  nameKey,
  valueUnit,
  dateKey,
  timestampKey,
  deltaKey,
  tooltipLabel,
  formatter,
  detailFormatter,
}: {
  item: ChartTooltipItem;
  index: number;
  config: ChartConfig;
  color?: string;
  indicator: 'line' | 'dot' | 'dashed';
  hideIndicator: boolean;
  nestLabel: boolean;
  nameKey?: string;
  valueUnit?: string;
  dateKey: string;
  timestampKey: string;
  deltaKey: string;
  tooltipLabel: React.ReactNode;
  formatter?: ChartTooltipContentProps['formatter'];
  detailFormatter?: ChartTooltipContentProps['detailFormatter'];
}) {
  const detail = getTooltipDetail(
    item,
    index,
    config,
    nameKey,
    valueUnit,
    dateKey,
    timestampKey,
    deltaKey
  );
  const indicatorColor = color || item.payload?.fill || item.color;

  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
        indicator === 'dot' && 'items-center'
      )}
    >
      {renderTooltipItemContent({
        item,
        detail,
        detailFormatter,
        formatter,
        defaultContent: (
          <TooltipDefaultItem
            item={item}
            itemConfig={detail.itemConfig}
            valueWithUnit={detail.valueWithUnit}
            tooltipLabel={tooltipLabel}
            indicator={indicator}
            hideIndicator={hideIndicator}
            nestLabel={nestLabel}
            indicatorColor={indicatorColor}
          />
        ),
      })}
    </div>
  );
}

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  ChartTooltipContentProps
>(function ChartTooltipContent(
  {
    active,
    payload,
    className,
    indicator = 'dot',
    hideLabel = false,
    hideIndicator = false,
    label,
    labelFormatter,
    labelClassName,
    formatter,
    color,
    nameKey,
    labelKey,
    valueUnit,
    dateKey = 'date',
    timestampKey = 'timestamp',
    deltaKey = 'delta',
    detailFormatter,
  },
  ref
) {
  const { config } = useChart();
  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) return null;
    const [item] = payload;
    const value = getTooltipLabel(config, item, label, labelKey);

    return renderTooltipLabel(value, labelFormatter, payload, labelClassName);
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ]);

  if (!active || !payload?.length) return null;
  const nestLabel = payload.length === 1 && indicator !== 'dot';

  return (
    <div
      ref={ref}
      className={cn(
        'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => (
          <ChartTooltipItem
            key={item.dataKey}
            item={item}
            index={index}
            config={config}
            color={color}
            indicator={indicator}
            hideIndicator={hideIndicator}
            nestLabel={nestLabel}
            nameKey={nameKey}
            valueUnit={valueUnit}
            dateKey={dateKey}
            timestampKey={timestampKey}
            deltaKey={deltaKey}
            tooltipLabel={tooltipLabel}
            formatter={formatter}
            detailFormatter={detailFormatter}
          />
        ))}
      </div>
    </div>
  );
});

ChartTooltipContent.displayName = 'ChartTooltip';
