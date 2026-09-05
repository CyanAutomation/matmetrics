import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import React from 'react';

import promptSettingsManifest from './plugin.json';
import { PromptSettings } from './src/components/prompt-settings';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';
import { resolveDashboardExtensionsToTabs } from '@/lib/navigation/tab-definitions';
import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';

testPluginManifestContract({
  pluginId: 'prompt-settings',
  requiredCapabilities: [],
  dashboardExtensionId: 'prompt-settings-dashboard-tab',
  componentId: 'prompt_settings',
  manifest: promptSettingsManifest,
  requirementSource: 'docs/plugin-contract.md#manifest',
});

test('prompt-settings is discovered and mapped to one resolvable dashboard tab', async () => {
  const pluginsRoot = await mkdtemp(
    path.join(os.tmpdir(), 'matmetrics-prompt-settings-')
  );
  test.after(() => rm(pluginsRoot, { recursive: true, force: true }));

  const pluginRoot = path.join(pluginsRoot, promptSettingsManifest.id);
  await mkdir(pluginRoot);
  await writeFile(
    path.join(pluginRoot, 'plugin.json'),
    JSON.stringify(promptSettingsManifest)
  );

  const extensions = await discoverEnabledDashboardTabExtensions({
    pluginsRoot,
    enabledOverrides: {},
  });

  assert.equal(extensions.length, 1);
  assert.equal(extensions[0]?.pluginId, 'prompt-settings');
  assert.equal(extensions[0]?.extension.id, 'prompt-settings-dashboard-tab');

  const { tabs, warnings } = await resolveDashboardExtensionsToTabs(extensions);

  assert.deepEqual(warnings, []);
  assert.equal(tabs.length, 1, 'expected the registered renderer to resolve');
  assert.equal(tabs[0]?.id, 'prompt-settings');
  assert.ok(tabs[0]?.title.trim(), 'navigation item needs an accessible label');

  const rendered = tabs[0]?.render({
    sessions: [],
    refreshSessions: () => undefined,
    refreshPluginExtensions: () => undefined,
  });
  assert.ok(
    React.isValidElement<{
      children?: React.ReactNode;
      'data-plugin-surface'?: string;
    }>(rendered),
    'resolved renderer should return a plugin surface'
  );
  assert.equal(
    rendered.props['data-plugin-surface'],
    'prompt-settings:prompt-settings-dashboard-tab'
  );

  const promptSettingsSurface = rendered.props.children;
  assert.ok(
    React.isValidElement(promptSettingsSurface),
    'plugin surface should contain prompt settings'
  );
  assert.equal(promptSettingsSurface.type, PromptSettings);
});
