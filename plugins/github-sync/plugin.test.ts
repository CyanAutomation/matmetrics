import assert from 'node:assert/strict';
import test from 'node:test';

import githubSyncManifest from './plugin.json';
import { validatePluginManifest } from '@/lib/plugins/validate';

test('github-sync manifest validates and exposes expected dashboard tab contract', () => {
  const validation = validatePluginManifest(githubSyncManifest);

  assert.equal(validation.isValid, true);
  if (!validation.isValid) {
    return;
  }

  const dashboardTab = validation.manifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(dashboardTab, 'Expected a dashboard_tab extension in the manifest');
  assert.equal(validation.manifest.id, 'github-sync');
  assert.equal(dashboardTab.id, 'github-sync-dashboard-tab');
  assert.equal(dashboardTab.config.tabId, 'github-sync');
  assert.equal(dashboardTab.config.component, 'github_settings');
});
