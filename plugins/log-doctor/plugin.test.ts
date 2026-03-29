import assert from 'node:assert/strict';
import test from 'node:test';

import logDoctorManifest from './plugin.json';
import { validatePluginManifest } from '@/lib/plugins/validate';

test('log-doctor manifest validates and exposes expected dashboard tab contract', () => {
  const validation = validatePluginManifest(logDoctorManifest);

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

  assert.equal(validation.manifest.id, 'log-doctor');
  assert.equal(dashboardTab.id, 'log-doctor-dashboard-tab');
  assert.equal(dashboardTabConfig.tabId, 'log-doctor');
  assert.equal(dashboardTabConfig.component, 'log_doctor');
});
