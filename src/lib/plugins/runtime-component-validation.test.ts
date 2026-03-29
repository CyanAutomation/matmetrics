import assert from 'node:assert/strict';
import test from 'node:test';

import { clearDashboardTabRendererRegistryForTests } from '@/lib/plugins/dashboard-tab-adapters';
import { resetPluginComponentRegistryInitializationForTests } from '@/lib/plugins/plugin-component-bootstrap';
import { validateManifestComponentRenderers } from '@/lib/plugins/runtime-component-validation';
import type { PluginManifest } from '@/lib/plugins/types';
import githubSyncManifest from '../../../plugins/github-sync/plugin.json';

test.afterEach(() => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();
});

test('validateManifestComponentRenderers resolves declared github-sync component id', async () => {
  const issues = await validateManifestComponentRenderers(
    githubSyncManifest as PluginManifest
  );

  assert.deepEqual(issues, []);
});

test('validateManifestComponentRenderers flags unresolved component id predictably', async () => {
  const manifest: PluginManifest = {
    id: 'broken-runtime-plugin',
    name: 'Broken Runtime Plugin',
    version: '1.0.0',
    description: 'Declares component ids that do not exist.',
    enabled: true,
    uiExtensions: [
      {
        type: 'dashboard_tab',
        id: 'broken-runtime-dashboard-tab',
        title: 'Broken Runtime',
        config: {
          tabId: 'broken-runtime',
          headerTitle: 'Broken Runtime',
          component: 'missing_renderer',
        },
      },
    ],
  };

  const issues = await validateManifestComponentRenderers(manifest);

  assert.deepEqual(issues, [
    {
      severity: 'warning',
      path: 'uiExtensions[0].config.component',
      message:
        'Extension "broken-runtime-dashboard-tab" declares component "missing_renderer" but no dashboard renderer is registered after plugin bootstrap.',
    },
  ]);
});
