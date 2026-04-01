import type { ReactNode } from 'react';

import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { cn } from '@/lib/utils';

type PluginFilterBarProps = {
  children: ReactNode;
  className?: string;
};

export function PluginFilterBar({ children, className }: PluginFilterBarProps) {
  return (
    <div
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
