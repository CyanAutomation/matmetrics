import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { Github } from 'lucide-react';

import githubSyncManifest from './plugin.json';
import { resolveDashboardExtensionsToTabs } from '@/lib/navigation/tab-definitions';
import { discoverEnabledDashboardTabExtensions } from '@/lib/plugins/discovery.server';
import { validatePluginManifest } from '@/lib/plugins/validate';

test('github-sync is discovered and mapped to its dashboard settings tab', async () => {
  const discoveredExtensions = await discoverEnabledDashboardTabExtensions({
    pluginsRoot: path.resolve(process.cwd(), 'plugins'),
    enabledOverrides: {},
  });
  const githubSyncExtensions = discoveredExtensions.filter(
    ({ pluginId }) => pluginId === 'github-sync'
  );

  assert.equal(githubSyncExtensions.length, 1);
  assert.equal(
    githubSyncExtensions[0]?.extension.id,
    'github-sync-dashboard-tab'
  );
  assert.equal(githubSyncExtensions[0]?.extension.config.tabId, 'github-sync');

  const { tabs, warnings } =
    await resolveDashboardExtensionsToTabs(githubSyncExtensions);

  assert.deepEqual(warnings, []);
  assert.equal(tabs.length, 1, 'expected the registered renderer to resolve');
  assert.equal(tabs[0]?.id, 'github-sync');
  assert.ok(tabs[0]?.title.trim(), 'navigation item needs an accessible label');
  assert.equal(
    tabs[0]?.icon,
    Github,
    'navigation item should use a supported icon'
  );
  assert.equal(typeof tabs[0]?.render, 'function');
});

test('github-sync invalid extension configuration fails generic validation', () => {
  const invalidManifest = structuredClone(githubSyncManifest);
  if (!invalidManifest.uiExtensions[0]) {
    throw new Error('Test setup failed: uiExtensions[0] not found');
  }
  invalidManifest.uiExtensions[0].config.component = '';

  const validation = validatePluginManifest(invalidManifest);

  assert.equal(validation.isValid, false);
  assert.ok(
    validation.issues.some(
      ({ severity, path }) =>
        severity === 'error' && path === 'uiExtensions[0].config.component'
    )
  );
});
