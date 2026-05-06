import assert from 'node:assert/strict';
import test from 'node:test';

import githubSyncManifest from './plugin.json';

test('github-sync manifest declares the expected settings tab copy and icon', () => {
  const dashboardTab = githubSyncManifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(dashboardTab, 'expected a dashboard_tab extension');
  assert.equal(dashboardTab.title, 'GitHub Sync');
  assert.equal(dashboardTab.config.headerTitle, 'GitHub Sync Config');
  assert.equal(dashboardTab.config.icon, 'github');
});

test('github-sync manifest evidence tracks sync-specific UX safeguards', () => {
  assert.deepEqual(githubSyncManifest.uiContract.requiredUxStates, [
    'loading',
    'error',
    'empty',
    'destructive',
  ]);
  assert.equal(
    githubSyncManifest.maturity.evidence.uxCriteria.destructiveActionSafety[0],
    'plugins/github-sync/src/components/github-settings.destructive.test.tsx'
  );
});
