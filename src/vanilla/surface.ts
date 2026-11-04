export type SurfaceVariant =
  | 'default'
  | 'subtle'
  | 'elevated'
  | 'interactive'
  | null;

export type SurfacePadding = 'none' | 'sm' | 'default' | 'lg' | null;

export interface SurfaceStyleProps {
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
}

/** Return the shared classes for a design-system surface. */
export function surfaceClassName({
  variant = 'default',
  padding = 'default',
}: SurfaceStyleProps = {}): string {
  return [
    'ui-surface',
    `ui-surface--${variant ?? 'default'}`,
    `ui-surface--padding-${padding ?? 'default'}`,
  ].join(' ');
}
