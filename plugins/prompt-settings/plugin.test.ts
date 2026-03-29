import assert from 'node:assert/strict';
import test from 'node:test';

import promptSettingsManifest from './plugin.json';
import { validatePluginManifest } from '@/lib/plugins/validate';

test('prompt-settings manifest validates and exposes expected dashboard tab contract', () => {
  const validation = validatePluginManifest(promptSettingsManifest);

  assert.equal(validation.isValid, true);
  if (!validation.isValid) {
    return;
  }

  const dashboardTab = validation.manifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(dashboardTab, 'Expected a dashboard_tab extension in the manifest');
  if (!dashboardTab) {
    return;
  }
  const dashboardTabConfig = dashboardTab.config as {
    tabId: string;
    component: string;
  };
  assert.equal(validation.manifest.id, 'prompt-settings');
  assert.equal(dashboardTab.id, 'prompt-settings-dashboard-tab');
  assert.equal(dashboardTabConfig.tabId, 'prompt-settings');
  assert.equal(dashboardTabConfig.component, 'prompt_settings');
});
