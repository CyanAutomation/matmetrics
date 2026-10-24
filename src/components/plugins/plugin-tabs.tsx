import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
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
};

export function PluginTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: PluginTabsProps) {
  return (
    <div role="tablist" className={cn('flex gap-2 border-b pb-2', className)}>
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          type="button"
          variant="ghost"
          size="sm"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`plugin-tab-panel-${tab.id}`}
          className={cn(
            'gap-2',
            activeTab === tab.id
              ? 'bg-primary text-primary-foreground'
              : getPluginUiTokenClassNames('tab.inactive')
          )}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.badge}
        </Button>
      ))}
    </div>
  );
}
