import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';

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

const requireFromTest = createRequire(import.meta.url);

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

test('maps dashboard tab extension fixture into plugin tab metadata', async () => {
  const tabs = await mapDashboardExtensionsToTabs([
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

test('integration: loadEnabledDashboardTabExtensions wires into tab mapping', async () => {
  const tabs = await mapDashboardExtensionsToTabs(
    loadEnabledDashboardTabExtensions()
  );

  assert.ok(tabs.some((tab) => tab.id === 'tag-manager'));
  assert.ok(tabs.some((tab) => tab.id === 'github-sync'));
  assert.ok(tabs.some((tab) => tab.id === 'prompt-settings'));
});

test('core tabs no longer include prompt settings', () => {
  assert.equal(
    coreTabs.some((tab) => tab.title === 'Prompt Settings'),
    false
  );
  assert.equal(
    coreTabs.some((tab) => tab.title === 'GitHub Sync'),
    false
  );
});

test('plugins is the last core navigation item', () => {
  assert.equal(coreTabs[coreTabs.length - 1]?.title, 'Plugins');
});

test('resolves plugin tab when renderer is registered in the registry', async () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  registerPluginComponent(
    'custom_component',
    () => 'rendered-custom-component'
  );

  const { tabs, warnings } = await resolveDashboardExtensionsToTabs([
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

test('captures structured runtime warning when plugin component cannot be resolved', async () => {
  const warningsCaptured = [] as Array<{
    code: string;
    path: string;
    message: string;
  }>;

  const tabs = await mapDashboardExtensionsToTabs(
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

test('captures runtime warning and skips tab when required capability is missing', async () => {
  const warningsCaptured = [] as Array<{
    code: string;
    path: string;
    message: string;
  }>;

  const tabs = await mapDashboardExtensionsToTabs(
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

test('awaits async plugin init before resolving renderers to avoid timing warnings', async () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  const tagManagerModulePath = requireFromTest.resolve(
    '../../../plugins/tag-manager/src/index'
  );
  const originalCacheEntry = requireFromTest.cache[tagManagerModulePath];
  requireFromTest.cache[tagManagerModulePath] = {
    id: tagManagerModulePath,
    filename: tagManagerModulePath,
    loaded: true,
    exports: {
      initPlugin: async (context: {
        register?: (extensionId: string) => void;
        registerPluginComponent?: typeof registerPluginComponent;
      }) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        context.register?.('tag-manager-dashboard-tab');
        context.registerPluginComponent?.(
          'tag_manager',
          () => 'async-rendered-tag-manager'
        );
      },
    },
  } as NodeModule;

  try {
    const warningsCaptured: Array<{ code: string }> = [];
    const tabs = await mapDashboardExtensionsToTabs(
      [
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
      ],
      {
        onWarning: (warning) => {
          warningsCaptured.push({ code: warning.code });
        },
      }
    );

    assert.equal(tabs.length, 1);
    assert.equal(warningsCaptured.length, 0);
  } finally {
    if (originalCacheEntry) {
      requireFromTest.cache[tagManagerModulePath] = originalCacheEntry;
    } else {
      delete requireFromTest.cache[tagManagerModulePath];
    }
  }
});

test('wraps plugin tab renderer in wide layout surface when uiContract.layoutVariant is wide', async () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  registerPluginComponent('wide_component', () =>
    React.createElement('div', null, 'wide-rendered')
  );

  const { tabs, warnings } = await resolveDashboardExtensionsToTabs([
    createDashboardTabExtensionFixture({
      pluginId: 'wide-plugin',
      capabilities: [],
      uiContract: {
        layoutVariant: 'wide',
        requiredUxStates: [],
      },
      extension: {
        type: 'dashboard_tab',
        id: 'wide-extension',
        title: 'Wide Plugin Tab',
        config: {
          tabId: 'wide-plugin-tab',
          headerTitle: 'Wide Plugin Header',
          component: 'wide_component',
          icon: 'tags',
        },
      },
    }),
  ]);

  assert.equal(warnings.length, 0);
  assert.equal(tabs.length, 1);

  const rendered = tabs[0]?.render({
    sessions: [],
    refreshSessions: () => undefined,
    refreshPluginExtensions: () => undefined,
  });

  assert.equal(React.isValidElement(rendered), true);
  assert.match(
    String((rendered as React.ReactElement).props.className),
    /max-w-6xl/
  );
  assert.equal(
    (rendered as React.ReactElement).props['data-layout-variant'],
    'wide'
  );
});

test('emits runtime warning when required UX state helpers are missing from plugin render tree', async () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  registerPluginComponent('missing_state_component', () =>
    React.createElement('div', null, 'no-state-helpers')
  );

  const { tabs, warnings } = await resolveDashboardExtensionsToTabs([
    createDashboardTabExtensionFixture({
      pluginId: 'state-contract-plugin',
      capabilities: [],
      uiContract: {
        layoutVariant: 'standard',
        requiredUxStates: ['loading', 'error', 'empty', 'destructive'],
      },
      extension: {
        type: 'dashboard_tab',
        id: 'state-contract-extension',
        title: 'State Contract Plugin Tab',
        config: {
          tabId: 'state-contract-plugin-tab',
          headerTitle: 'State Contract Plugin Header',
          component: 'missing_state_component',
          icon: 'tags',
        },
      },
    }),
  ]);

  assert.equal(warnings.length, 0);
  assert.equal(tabs.length, 1);

  const originalWarn = console.warn;
  const warningMessages: Array<{ code?: string }> = [];
  console.warn = (_message: string, warning: { code?: string }) => {
    warningMessages.push(warning);
  };

  try {
    tabs[0]?.render({
      sessions: [],
      refreshSessions: () => undefined,
      refreshPluginExtensions: () => undefined,
    });
  } finally {
    console.warn = originalWarn;
  }

  const missingHelperWarnings = warningMessages.filter(
    (warning) =>
      warning.code === 'dashboard_tab_required_ux_state_helper_missing'
  );
  assert.equal(missingHelperWarnings.length, 4);
});
