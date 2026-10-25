'use client';

import { useEffect, useState } from 'react';
import { TAB_IDS, type TabId } from '@/lib/navigation/tab-definitions';
import { getGitHubBackupReturnTab } from '@/lib/navigation/github-backup-return';

/**
 * Manages dashboard tab navigation state
 */
export function useDashboardNavigation() {
  const [activeTab, setActiveTab] = useState<TabId>(TAB_IDS.dashboard);

  useEffect(() => {
    const returnTab = getGitHubBackupReturnTab(window.location.search);
    if (returnTab) setActiveTab(returnTab);
  }, []);

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
