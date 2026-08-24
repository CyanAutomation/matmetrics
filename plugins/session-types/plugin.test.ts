import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { SlidersHorizontal } from 'lucide-react';

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
  const extensions = await discoverEnabledDashboardTabExtensions({
    pluginsRoot: path.resolve(process.cwd(), 'plugins'),
    enabledOverrides: {},
  });
  const sessionTypesExtensions = extensions.filter(
    ({ pluginId }) => pluginId === 'session-types'
  );
  const { tabs, warnings } = await resolveDashboardExtensionsToTabs(
    sessionTypesExtensions
  );

  assert.deepEqual(warnings, []);
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0]?.id, 'session-types');
  assert.equal(tabs[0]?.icon, SlidersHorizontal);
});
