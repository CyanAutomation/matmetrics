'use client';

import { useState } from 'react';
import { TAB_IDS, type TabId } from '@/lib/navigation/tab-definitions';

/**
 * Manages dashboard tab navigation state
 */
export function useDashboardNavigation() {
  const [activeTab, setActiveTab] = useState<TabId>(TAB_IDS.dashboard);

  const navigateToTab = (tabId: TabId) => {
    setActiveTab(tabId);
    requestAnimationFrame(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = 0;
    });
  };

  return {
    activeTab,
    setActiveTab: navigateToTab,
  };
}
