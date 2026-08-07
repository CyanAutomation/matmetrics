import assert from 'node:assert/strict';
import test from 'node:test';

import promptSettingsManifest from './plugin.json';

test('prompt-settings manifest declares the expected dashboard tab copy and icon', () => {
  const dashboardTab = promptSettingsManifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(dashboardTab, 'expected a dashboard_tab extension');
  assert.equal(dashboardTab.title, 'Prompt Settings');
  assert.equal(dashboardTab.config.headerTitle, 'AI Prompt Configuration');
  assert.equal(dashboardTab.config.icon, 'brain');
});
