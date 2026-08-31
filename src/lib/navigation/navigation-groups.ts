type NavigableTab = {
  id: string;
  title: string;
};

export type NavigationGroup<T extends NavigableTab = NavigableTab> = {
  label: 'Training' | 'Workspace' | 'Data & backup' | 'Advanced';
  tabs: T[];
};

const groupOrder: ReadonlyArray<NavigationGroup['label']> = [
  'Training',
  'Workspace',
  'Data & backup',
  'Advanced',
];

const tabGroupByTitle: Record<string, NavigationGroup['label']> = {
  Dashboard: 'Training',
  'Training History': 'Training',
  'Session Types': 'Training',
  'Video Library': 'Workspace',
  'Tag Manager': 'Workspace',
  'Prompt Settings': 'Workspace',
  'GitHub Sync': 'Data & backup',
  'Log Doctor': 'Data & backup',
  Plugins: 'Advanced',
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
        (tab) => (tabGroupByTitle[tab.title] ?? 'Workspace') === label
      ),
    }))
    .filter((group) => group.tabs.length > 0);
}
