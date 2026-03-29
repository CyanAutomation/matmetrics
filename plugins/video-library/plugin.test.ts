import assert from 'node:assert/strict';
import test from 'node:test';

import videoLibraryManifest from './plugin.json';
import { validatePluginManifest } from '@/lib/plugins/validate';

test('video-library manifest validates and exposes expected dashboard tab contract', () => {
  const validation = validatePluginManifest(videoLibraryManifest);

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
  assert.equal(validation.manifest.id, 'video-library');
  assert.equal(dashboardTab.id, 'video-library-dashboard-tab');
  assert.equal(dashboardTabConfig.tabId, 'video-library');
  assert.equal(dashboardTabConfig.component, 'video_library');
});
