import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadEnabledDashboardTabExtensions,
} from '@/lib/plugins/registry';
import { loadDashboardTabExtensions } from '@/lib/plugins/load-dashboard-tab-extensions';
import { createPluginEnabledStateIsolation } from '@/lib/plugins/registry.test-support';

const discoveredExtension = {
  pluginId: 'tag-manager',
  capabilities: ['tag_mutation'],
  extension: {
    type: 'dashboard_tab' as const,
    id: 'tag-manager-dashboard-tab',
    title: 'Tag Manager',
    config: {
      tabId: 'tag-manager',
      headerTitle: 'Manage Tags',
      icon: 'tags',
      component: 'tag_manager',
    },
  },
};

const pluginEnabledStateIsolation = createPluginEnabledStateIsolation();

test.afterEach(async () => {
  await pluginEnabledStateIsolation.restoreTouchedPluginStates();
});

test('loadDashboardTabExtensions uses discovery API response when available', async () => {
  const fallbackLoader = () => [];
  let fallbackCalls = 0;

  const result = await loadDashboardTabExtensions({
    useLegacyRegistryFallback: false,
    fallbackLoader: () => {
      fallbackCalls += 1;
      return fallbackLoader();
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ extensions: [discoveredExtension] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  assert.deepEqual(result, [discoveredExtension]);
  assert.equal(fallbackCalls, 0);
});

test('loadDashboardTabExtensions falls back to local registry when discovery fails', async () => {
  const fallbackResult = [discoveredExtension];
  let fallbackCalls = 0;

  const result = await loadDashboardTabExtensions({
    useLegacyRegistryFallback: false,
    fallbackLoader: () => {
      fallbackCalls += 1;
      return fallbackResult;
    },
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });

  assert.deepEqual(result, fallbackResult);
  assert.equal(fallbackCalls, 1);
});

test('loadDashboardTabExtensions legacy fallback respects enabled filtering', async () => {
  await pluginEnabledStateIsolation.setEnabled('tag-manager', true);

  const enabledResult = await loadDashboardTabExtensions({
    useLegacyRegistryFallback: true,
    fallbackLoader: loadEnabledDashboardTabExtensions,
  });
  assert.equal(
    enabledResult.some((entry) => entry.pluginId === 'tag-manager'),
    true
  );

  await pluginEnabledStateIsolation.setEnabled('tag-manager', false);

  const disabledResult = await loadDashboardTabExtensions({
    useLegacyRegistryFallback: true,
    fallbackLoader: loadEnabledDashboardTabExtensions,
  });
  assert.equal(
    disabledResult.some((entry) => entry.pluginId === 'tag-manager'),
    false
  );
});
