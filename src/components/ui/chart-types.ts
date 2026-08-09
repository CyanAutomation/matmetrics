import type * as React from 'react';

export const CHART_THEMES = { light: '', dark: '.dark' } as const;

export type ChartMarkerShape = 'circle' | 'square' | 'diamond' | 'triangle';
export type ChartStrokeStyle = 'solid' | 'dashed' | 'dotted';

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    markerShape?: ChartMarkerShape;
    strokeStyle?: ChartStrokeStyle;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof CHART_THEMES, string> }
  );
};
