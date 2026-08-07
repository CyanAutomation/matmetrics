import type { ComponentPropsWithoutRef } from 'react';

import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { cn } from '@/lib/utils';

type PluginFilterBarProps = ComponentPropsWithoutRef<'div'>;

export function PluginFilterBar({
  children,
  className,
  ...props
}: PluginFilterBarProps) {
  return (
    <div
      {...props}
      className={cn(
        getPluginUiTokenClassNames('layout.filter-bar'),
        'lg:grid-cols-5',
        className
      )}
    >
      {children}
    </div>
  );
}
