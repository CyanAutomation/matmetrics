'use client';

import { useState } from 'react';
import { TAB_IDS, type TabId } from '@/lib/navigation/tab-definitions';

/**
 * Manages dashboard tab navigation state
 */
export function useDashboardNavigation() {
  const [activeTab, setActiveTab] = useState<TabId>(TAB_IDS.dashboard);

  return {
    activeTab,
    setActiveTab,
  };
}
