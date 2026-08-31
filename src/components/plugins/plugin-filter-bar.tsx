import type { ComponentPropsWithoutRef } from 'react';

import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { FilterBar } from '@/components/ui/filter-bar';

type PluginFilterBarProps = ComponentPropsWithoutRef<'div'>;

export function PluginFilterBar({
  children,
  className,
  ...props
}: PluginFilterBarProps) {
  return (
    <FilterBar
      {...props}
      label={props['aria-label'] ?? 'Filters'}
      className={[
        getPluginUiTokenClassNames('layout.filter-bar'),
        'lg:grid-cols-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </FilterBar>
  );
}
