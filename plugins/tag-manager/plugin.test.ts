import assert from 'node:assert/strict';
import test from 'node:test';

import tagManagerManifest from './plugin.json';
import { validatePluginManifest } from '@/lib/plugins/validate';

test('tag-manager manifest validates and exposes expected dashboard tab contract', () => {
  const validation = validatePluginManifest(tagManagerManifest);

  assert.equal(validation.isValid, true);
  if (!validation.isValid) {
    return;
  }

  const dashboardTab = validation.manifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(dashboardTab, 'Expected a dashboard_tab extension in the manifest');
  assert.equal(validation.manifest.id, 'tag-manager');
  assert.equal(dashboardTab.id, 'tag-manager-dashboard-tab');
  assert.equal(dashboardTab.config.tabId, 'tag-manager');
  assert.equal(dashboardTab.config.component, 'tag_manager');
});
