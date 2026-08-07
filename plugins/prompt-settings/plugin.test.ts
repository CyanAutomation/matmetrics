import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { BrainCircuit } from 'lucide-react';

import promptSettingsManifest from './plugin.json';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';
import { resolveDashboardExtensionsToTabs } from '@/lib/navigation/tab-definitions';
import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';

testPluginManifestContract({
  pluginId: 'prompt-settings',
  dashboardExtensionId: 'prompt-settings-dashboard-tab',
  componentId: 'prompt_settings',
  manifest: promptSettingsManifest,
  requirementSource: 'docs/plugin-contract.md#manifest',
});

test('prompt-settings is discovered and mapped to one resolvable dashboard tab', async () => {
  const discoveredExtensions = await discoverEnabledDashboardTabExtensions({
    pluginsRoot: path.resolve(process.cwd(), 'plugins'),
    enabledOverrides: {},
  });
  const promptSettingsExtensions = discoveredExtensions.filter(
    ({ pluginId }) => pluginId === 'prompt-settings'
  );

  assert.equal(promptSettingsExtensions.length, 1);
  assert.equal(
    promptSettingsExtensions[0]?.extension.id,
    'prompt-settings-dashboard-tab'
  );

  const { tabs, warnings } = await resolveDashboardExtensionsToTabs(
    promptSettingsExtensions
  );

  assert.deepEqual(warnings, []);
  assert.equal(tabs.length, 1, 'expected the registered renderer to resolve');
  assert.equal(tabs[0]?.id, 'prompt-settings');
  assert.ok(tabs[0]?.title.trim(), 'navigation item needs an accessible label');
  assert.equal(
    tabs[0]?.icon,
    BrainCircuit,
    'navigation item should use a supported icon'
  );
  assert.equal(typeof tabs[0]?.render, 'function');
});
