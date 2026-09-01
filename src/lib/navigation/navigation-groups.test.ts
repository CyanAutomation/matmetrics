import assert from 'node:assert/strict';
import test from 'node:test';

import { groupDashboardTabs } from './navigation-groups';

test('groups user-facing dashboard tabs by the athlete task, keeping extensions in settings', () => {
  const tabs = [
    { id: 'dashboard', title: 'Dashboard' },
    { id: 'history', title: 'Training History' },
    { id: 'session-types', title: 'Session Types' },
    { id: 'video-library', title: 'Video Library' },
    { id: 'tag-manager', title: 'Tag Manager' },
    { id: 'prompt-settings', title: 'Prompt Settings' },
    { id: 'github-sync', title: 'GitHub Sync' },
    { id: 'log-doctor', title: 'Log Doctor' },
    { id: 'plugin_manager', title: 'Plugins' },
  ];

  const groups = groupDashboardTabs(tabs);

  assert.deepEqual(
    groups.map((group) => group.label),
    ['Today', 'Library', 'Plan', 'Settings']
  );
  assert.deepEqual(
    groups.map((group) => group.tabs.map((tab) => tab.title)),
    [
      ['Dashboard', 'Training History'],
      ['Video Library', 'Tag Manager'],
      ['Session Types'],
      ['Prompt Settings', 'GitHub Sync', 'Log Doctor', 'Plugins'],
    ]
  );
});

test('retains unrecognised plugin tabs in Settings instead of hiding them', () => {
  const groups = groupDashboardTabs([
    { id: 'dashboard', title: 'Dashboard' },
    { id: 'analysis', title: 'Technique analysis' },
  ]);

  assert.deepEqual(
    groups[1].tabs.map((tab) => tab.title),
    ['Technique analysis']
  );
});
