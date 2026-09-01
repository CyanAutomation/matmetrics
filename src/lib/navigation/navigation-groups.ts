type NavigableTab = {
  id: string;
  title: string;
};

export type NavigationGroup<T extends NavigableTab = NavigableTab> = {
  label: 'Today' | 'Library' | 'Plan' | 'Settings';
  tabs: T[];
};

const groupOrder: ReadonlyArray<NavigationGroup['label']> = [
  'Today',
  'Library',
  'Plan',
  'Settings',
];

const tabGroupByTitle: Record<string, NavigationGroup['label']> = {
  Dashboard: 'Today',
  'Training History': 'Today',
  'Video Library': 'Library',
  'Tag Manager': 'Library',
  'Session Types': 'Plan',
  'Prompt Settings': 'Settings',
  'GitHub Sync': 'Settings',
  'Log Doctor': 'Settings',
  Plugins: 'Settings',
};

/**
 * Keeps navigation organised around the member's task rather than the
 * implementation mechanism that happens to power a page.
 */
export function groupDashboardTabs<T extends NavigableTab>(
  tabs: T[]
): NavigationGroup<T>[] {
  return groupOrder
    .map((label) => ({
      label,
      tabs: tabs.filter(
        (tab) => (tabGroupByTitle[tab.title] ?? 'Settings') === label
      ),
    }))
    .filter((group) => group.tabs.length > 0);
}
