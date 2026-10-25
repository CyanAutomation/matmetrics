'use client';

import { useEffect, useState } from 'react';
import { TAB_IDS, type TabId } from '@/lib/navigation/tab-definitions';
import {
  getGitHubBackupReturn,
  removeGitHubBackupReturn,
  type GitHubBackupResult,
} from '@/lib/navigation/github-backup-return';

/**
 * Manages dashboard tab navigation state
 */
export function useDashboardNavigation() {
  const [activeTab, setActiveTab] = useState<TabId>(TAB_IDS.dashboard);
  const [githubBackupResult, setGitHubBackupResult] = useState<
    GitHubBackupResult | null
  >(null);

  useEffect(() => {
    const githubBackupReturn = getGitHubBackupReturn(window.location.search);
    if (!githubBackupReturn) return;

    setActiveTab(githubBackupReturn.tab);
    setGitHubBackupResult(githubBackupReturn.result);
    const cleanedUrl = removeGitHubBackupReturn(new URL(window.location.href));
    window.history.replaceState(window.history.state, '', cleanedUrl.toString());
  }, []);

  const navigateToTab = (tabId: TabId) => {
    setActiveTab(tabId);
    setGitHubBackupResult(null);
    requestAnimationFrame(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = 0;
    });
  };

  return {
    activeTab,
    githubBackupResult,
    setActiveTab: navigateToTab,
  };
}
