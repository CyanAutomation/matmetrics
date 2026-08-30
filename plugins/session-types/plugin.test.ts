import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import sessionTypesManifest from './plugin.json';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';
import { resolveDashboardExtensionsToTabs } from '@/lib/navigation/tab-definitions';
import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';

testPluginManifestContract({
  pluginId: 'session-types',
  dashboardExtensionId: 'session-types-dashboard-tab',
  componentId: 'session_types',
  manifest: sessionTypesManifest,
  requirementSource: 'docs/plugin-contract.md#manifest',
});

test('session-types is discovered and mapped to a dashboard tab', async () => {
  const pluginsRoot = await mkdtemp(
    path.join(os.tmpdir(), 'matmetrics-session-types-')
  );
  test.after(() => rm(pluginsRoot, { recursive: true, force: true }));

  const pluginRoot = path.join(pluginsRoot, sessionTypesManifest.id);
  await mkdir(pluginRoot);
  await writeFile(
    path.join(pluginRoot, 'plugin.json'),
    JSON.stringify(sessionTypesManifest)
  );

  const extensions = await discoverEnabledDashboardTabExtensions({
    pluginsRoot,
    enabledOverrides: {},
  });
  assert.ok(sessionTypesManifest.uiExtensions?.length, 'manifest must have uiExtensions');
  const manifestExtension = sessionTypesManifest.uiExtensions[0];

  assert.equal(extensions.length, 1);
  assert.equal(extensions[0]?.pluginId, sessionTypesManifest.id);
  assert.equal(extensions[0]?.extension.id, manifestExtension.id);
  assert.equal(
    extensions[0]?.extension.config.component,
    manifestExtension.config.component
  );

  const { tabs, warnings } = await resolveDashboardExtensionsToTabs(extensions);

  assert.deepEqual(warnings, []);
  assert.equal(tabs.length, 1, 'expected the registered surface to resolve');
  assert.equal(tabs[0]?.id, manifestExtension.config.tabId);
  assert.ok(tabs[0]?.title.trim(), 'navigation item needs an accessible label');
  assert.equal(typeof tabs[0]?.render, 'function');
});
