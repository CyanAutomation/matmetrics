import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapDashboardExtensionsToTabs,
  resolveDashboardExtensionsToTabs,
} from '@/lib/navigation/tab-definitions';
import {
  clearDashboardTabRendererRegistryForTests,
  registerPluginComponent,
} from '@/lib/plugins/dashboard-tab-adapters';
import { resetPluginComponentRegistryInitializationForTests } from '@/lib/plugins/plugin-component-bootstrap';
import { loadEnabledDashboardTabExtensions } from '@/lib/plugins/registry';

test('resolves Tag Manager sidebar tab from plugin manifest extensions', () => {
  const extensions = loadEnabledDashboardTabExtensions();
  const tabs = mapDashboardExtensionsToTabs(extensions);

  const tagManagerTab = tabs.find((tab) => tab.id === 'tag-manager');

  assert.ok(tagManagerTab);
  assert.equal(tagManagerTab?.title, 'Tag Manager');
  assert.equal(tagManagerTab?.section, 'plugins');
});

test('resolves plugin tab when renderer is registered in the registry', () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  registerPluginComponent('custom_component', () => 'rendered-custom-component');

  const { tabs, warnings } = resolveDashboardExtensionsToTabs([
    {
      pluginId: 'custom-plugin',
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
    },
  ]);

  assert.equal(warnings.length, 0);
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0]?.id, 'custom-plugin-tab');
});

test('captures structured runtime warning when plugin component cannot be resolved', () => {
  const warningsCaptured = [] as Array<{ code: string; path: string; message: string }>;

  const tabs = mapDashboardExtensionsToTabs(
    [
      {
        pluginId: 'missing-renderer-plugin',
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
      },
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
