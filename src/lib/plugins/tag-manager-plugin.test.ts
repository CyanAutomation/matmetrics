import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidElement } from 'react';

import {
  TagManager,
  type TagManagerProps,
} from '../../../plugins/tag-manager/src/components/tag-manager';
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

test('tag-manager initPlugin registers its renderer with refresh wiring', () => {
  const registeredExtensionIds: string[] = [];
  let registeredComponentId: string | undefined;
  let registeredRenderer: ((context: TabRenderContext) => unknown) | undefined;

  initPlugin({
    register: (extensionId) => {
      registeredExtensionIds.push(extensionId);
    },
    registerPluginComponent: (componentId, renderer) => {
      registeredComponentId = componentId;
      registeredRenderer = renderer;
    },
  });

  assert.deepEqual(registeredExtensionIds, ['tag-manager-dashboard-tab']);
  assert.equal(registeredComponentId, 'tag_manager');
  if (!registeredRenderer) {
    throw new Error('Expected tag-manager to register a renderer.');
  }

  const refreshSessions = () => undefined;
  const rendered = registeredRenderer({
    sessions: [],
    refreshSessions,
    refreshPluginExtensions: () => undefined,
  });

  assert.ok(
    isValidElement<TagManagerProps>(rendered),
    'Expected the registered renderer to expose the Tag Manager root surface.'
  );
  assert.equal(rendered.type, TagManager);
  assert.equal(rendered.props.onRefresh, refreshSessions);
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
