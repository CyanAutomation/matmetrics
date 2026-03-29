import assert from 'node:assert/strict';
import test from 'node:test';

import { TagManager } from '@/components/tag-manager';
import {
  clearDashboardTabRendererRegistryForTests,
  resolveDashboardTabRenderer,
} from '@/lib/plugins/dashboard-tab-adapters';
import { resetPluginComponentRegistryInitializationForTests } from '@/lib/plugins/plugin-component-bootstrap';
import { type TabRenderContext } from '@/lib/navigation/tab-definitions';
import tagManagerManifest from '../../../plugins/tag-manager/plugin.json';
import { initPlugin } from '../../../plugins/tag-manager/src/index';

test.afterEach(() => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();
});

test('tag-manager manifest contract includes required runtime fields', () => {
  assert.equal(tagManagerManifest.id, 'tag-manager');
  assert.deepEqual(tagManagerManifest.capabilities, ['tag_mutation']);
  assert.equal(tagManagerManifest.maturity?.uxStates?.loading, true);
  assert.equal(
    tagManagerManifest.maturity?.uxCriteria?.loadingStatePresent,
    true
  );
  assert.equal(
    tagManagerManifest.uiExtensions[0]?.id,
    'tag-manager-dashboard-tab'
  );
  assert.equal(
    tagManagerManifest.uiExtensions[0]?.config.component,
    'tag_manager'
  );
});

test('tag-manager initPlugin wires register and registerPluginComponent', () => {
  const registeredExtensionIds: string[] = [];
  const registeredComponents: Array<{
    componentId: string;
    renderer: (context: TabRenderContext) => unknown;
  }> = [];

  initPlugin({
    register: (extensionId) => {
      registeredExtensionIds.push(extensionId);
    },
    registerPluginComponent: (componentId, renderer) => {
      registeredComponents.push({ componentId, renderer });
    },
  });

  assert.deepEqual(registeredExtensionIds, ['tag-manager-dashboard-tab']);
  assert.equal(registeredComponents.length, 1);
  assert.equal(registeredComponents[0]?.componentId, 'tag_manager');
});

test('tag-manager renderer returns TagManager and forwards refreshSessions as onRefresh', () => {
  let capturedRenderer: ((context: TabRenderContext) => unknown) | null = null;

  initPlugin({
    register: () => undefined,
    registerPluginComponent: (_componentId, renderer) => {
      capturedRenderer = renderer;
    },
  });

  assert.ok(capturedRenderer, 'Expected tag-manager to register a renderer.');
  if (!capturedRenderer) {
    throw new Error('Expected tag-manager to register a renderer.');
  }
  const renderer = capturedRenderer as (context: TabRenderContext) => unknown;

  const refreshSessions = () => undefined;
  const rendered = renderer({
    sessions: [],
    refreshSessions,
    refreshPluginExtensions: () => undefined,
  });

  assert.equal(
    typeof rendered,
    'object',
    'Expected renderer to return a React element-like object.'
  );

  const element = rendered as {
    type?: unknown;
    props?: { onRefresh?: unknown };
  };
  assert.equal(element.type, TagManager);
  assert.equal(element.props?.onRefresh, refreshSessions);
});

test('tag-manager dashboard renderer resolves after plugin bootstrap', async () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  const renderer = await resolveDashboardTabRenderer('tag_manager');

  assert.ok(
    renderer,
    'Expected tag-manager renderer to resolve after bootstrap.'
  );
});
