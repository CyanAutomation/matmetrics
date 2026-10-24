import {
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

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
  ariaLabel: string;
  className?: string;
};

type PluginTabPanelProps = ComponentPropsWithoutRef<'div'> & {
  tabId: string;
  selected: boolean;
};

const getPluginTabId = (tabId: string) => `plugin-tab-${tabId}`;
const getPluginTabPanelId = (tabId: string) => `plugin-tab-panel-${tabId}`;

export function PluginTabPanel({
  tabId,
  selected,
  ...props
}: PluginTabPanelProps) {
  return (
    <div
      {...props}
      id={getPluginTabPanelId(tabId)}
      role="tabpanel"
      aria-labelledby={getPluginTabId(tabId)}
      tabIndex={selected ? 0 : -1}
      hidden={!selected}
    />
  );
}

export function PluginTabs({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  className,
}: PluginTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    let nextIndex: number | undefined;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;

    tabRefs.current[nextIndex]?.focus();
    if (nextTab.id !== activeTab) onTabChange(nextTab.id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn('flex gap-2 border-b pb-2', className)}
    >
      {tabs.map((tab, index) => (
        <Button
          key={tab.id}
          ref={(element) => {
            tabRefs.current[index] = element;
          }}
          type="button"
          variant="ghost"
          size="sm"
          role="tab"
          id={getPluginTabId(tab.id)}
          tabIndex={activeTab === tab.id ? 0 : -1}
          aria-selected={activeTab === tab.id}
          aria-controls={getPluginTabPanelId(tab.id)}
          className={cn(
            'gap-2',
            activeTab === tab.id
              ? 'bg-primary text-primary-foreground'
              : getPluginUiTokenClassNames('tab.inactive')
          )}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
          {tab.badge}
        </Button>
      ))}
    </div>
  );
}
