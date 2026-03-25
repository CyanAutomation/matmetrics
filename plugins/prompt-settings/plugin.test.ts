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
  assert.equal(validation.manifest.id, 'prompt-settings');
  assert.equal(dashboardTab.id, 'prompt-settings-dashboard-tab');
  assert.equal(dashboardTab.config.tabId, 'prompt-settings');
  assert.equal(dashboardTab.config.component, 'prompt_settings');
});
