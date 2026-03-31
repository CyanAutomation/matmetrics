import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PluginTabItem = {
  id: string;
  label: string;
  badge?: ReactNode;
};

type PluginTabsProps = {
  tabs: PluginTabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
};

export function PluginTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
  contentClassName,
  children,
}: PluginTabsProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div
        role="tablist"
        className={cn('flex gap-2 border-b pb-2', className)}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`plugin-tab-panel-${tab.id}`}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            {tab.badge}
          </button>
        ))}
      </div>
      {children ? (
        <div className={contentClassName}>{children}</div>
      ) : null}
    </div>
  );
}
