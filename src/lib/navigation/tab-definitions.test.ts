import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coreTabs,
  mapDashboardExtensionsToTabs,
  resolveDashboardExtensionsToTabs,
} from '@/lib/navigation/tab-definitions';
import {
  clearDashboardTabRendererRegistryForTests,
  registerPluginComponent,
} from '@/lib/plugins/dashboard-tab-adapters';
import { resetPluginComponentRegistryInitializationForTests } from '@/lib/plugins/plugin-component-bootstrap';
import { loadEnabledDashboardTabExtensions } from '@/lib/plugins/registry';
import type { ResolvedDashboardTabExtension } from '@/lib/plugins/types';

const createDashboardTabExtensionFixture = (
  overrides: Partial<ResolvedDashboardTabExtension> = {}
): ResolvedDashboardTabExtension => ({
  pluginId: 'fixture-plugin',
  capabilities: ['tag_mutation'],
  ...overrides,
  extension: {
    type: 'dashboard_tab',
    id: overrides.extension?.id ?? 'fixture-dashboard-extension',
    title: overrides.extension?.title ?? 'Fixture Tab',
    config: {
      tabId: 'fixture-tab',
      headerTitle: 'Fixture Header',
      component: 'tag_manager',
      icon: 'tags',
      ...overrides.extension?.config,
    },
  },
});

test('maps dashboard tab extension fixture into plugin tab metadata', () => {
  const tabs = mapDashboardExtensionsToTabs([
    createDashboardTabExtensionFixture({
      pluginId: 'tag-manager-plugin',
      extension: {
        type: 'dashboard_tab',
        id: 'tag-manager-dashboard-tab',
        title: 'Tag Manager',
        config: {
          tabId: 'tag-manager',
          headerTitle: 'Manage Tags',
          component: 'tag_manager',
          icon: 'tags',
        },
      },
    }),
  ]);

  assert.equal(tabs.length, 1);
  assert.equal(tabs[0]?.id, 'tag-manager');
  assert.equal(tabs[0]?.title, 'Tag Manager');
  assert.equal(tabs[0]?.section, 'plugins');
});

test('integration: loadEnabledDashboardTabExtensions wires into tab mapping', () => {
  const tabs = mapDashboardExtensionsToTabs(
    loadEnabledDashboardTabExtensions()
  );

  assert.ok(tabs.some((tab) => tab.id === 'tag-manager'));
  assert.ok(tabs.some((tab) => tab.id === 'prompt-settings'));
});

test('core tabs no longer include prompt settings', () => {
  assert.equal(
    coreTabs.some((tab) => tab.title === 'Prompt Settings'),
    false
  );
});

test('resolves plugin tab when renderer is registered in the registry', () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  registerPluginComponent(
    'custom_component',
    () => 'rendered-custom-component'
  );

  const { tabs, warnings } = resolveDashboardExtensionsToTabs([
    createDashboardTabExtensionFixture({
      pluginId: 'custom-plugin',
      capabilities: [],
      extension: {
        type: 'dashboard_tab',
        id: 'custom-plugin-dashboard-tab',
        title: 'Custom Plugin Tab',
        config: {
          tabId: 'custom-plugin-tab',
          headerTitle: 'Custom Plugin Header',
          component: 'custom_component',
          icon: 'tags',
        },
      },
    }),
  ]);

  assert.equal(warnings.length, 0);
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0]?.id, 'custom-plugin-tab');
});

test('captures structured runtime warning when plugin component cannot be resolved', () => {
  const warningsCaptured = [] as Array<{
    code: string;
    path: string;
    message: string;
  }>;

  const tabs = mapDashboardExtensionsToTabs(
    [
      createDashboardTabExtensionFixture({
        pluginId: 'missing-renderer-plugin',
        capabilities: [],
        extension: {
          type: 'dashboard_tab',
          id: 'missing-renderer-extension',
          title: 'Missing Renderer',
          config: {
            tabId: 'missing-renderer-tab',
            headerTitle: 'Missing Renderer Header',
            component: 'unknown_component',
          },
        },
      }),
    ],
    {
      onWarning: (warning) => {
        warningsCaptured.push(warning);
      },
    }
  );

  assert.equal(tabs.length, 0);
  assert.equal(warningsCaptured.length, 1);
  assert.equal(warningsCaptured[0]?.code, 'dashboard_tab_renderer_unresolved');
  assert.match(
    warningsCaptured[0]?.path ?? '',
    /plugins\.missing-renderer-plugin\.uiExtensions\.missing-renderer-extension\.config\.component/
  );
});

test('captures runtime warning and skips tab when required capability is missing', () => {
  const warningsCaptured = [] as Array<{
    code: string;
    path: string;
    message: string;
  }>;

  const tabs = mapDashboardExtensionsToTabs(
    [
      createDashboardTabExtensionFixture({
        pluginId: 'missing-capability-plugin',
        capabilities: [],
        extension: {
          type: 'dashboard_tab',
          id: 'tag-manager-dashboard-tab',
          title: 'Tag Manager',
          config: {
            tabId: 'tag-manager',
            headerTitle: 'Manage Tags',
            component: 'tag_manager',
          },
        },
      }),
    ],
    {
      onWarning: (warning) => {
        warningsCaptured.push(warning);
      },
    }
  );

  assert.equal(tabs.length, 0);
  assert.equal(warningsCaptured.length, 1);
  assert.equal(warningsCaptured[0]?.code, 'dashboard_tab_missing_capability');
  assert.match(
    warningsCaptured[0]?.path ?? '',
    /plugins\.missing-capability-plugin\.capabilities/
  );
});
