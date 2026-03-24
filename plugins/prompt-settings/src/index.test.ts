import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import promptSettingsManifest from '../plugin.json';
import { PromptSettings } from '@/components/prompt-settings';
import {
  clearDashboardTabRendererRegistryForTests,
  registerPluginComponent,
  resolveDashboardTabRenderer,
} from '@/lib/plugins/dashboard-tab-adapters';
import { resetPluginComponentRegistryInitializationForTests } from '@/lib/plugins/plugin-component-bootstrap';

import { initPlugin } from './index';

test('manifest dashboard tab component id is prompt_settings', () => {
  const dashboardTabExtension = promptSettingsManifest.uiExtensions.find(
    (extension) => extension.type === 'dashboard_tab'
  );

  assert.ok(dashboardTabExtension, 'dashboardTabExtension should exist');
  assert.equal(dashboardTabExtension.config.component, 'prompt_settings');
});

test('initPlugin registers the prompt-settings extension id and component id', () => {
  const registeredExtensionIds: string[] = [];
  const registeredComponentIds: string[] = [];

  initPlugin({
    register: (extensionId) => {
      registeredExtensionIds.push(extensionId);
    },
    registerPluginComponent: (componentId, renderer) => {
      registeredComponentIds.push(componentId);
      registerPluginComponent(componentId, renderer);
    },
  });

  assert.deepEqual(registeredExtensionIds, ['prompt-settings-dashboard-tab']);
  assert.deepEqual(registeredComponentIds, ['prompt_settings']);
});

test('dashboard renderer registry resolves prompt_settings to PromptSettings', () => {
  clearDashboardTabRendererRegistryForTests();
  resetPluginComponentRegistryInitializationForTests();

  initPlugin({
    registerPluginComponent,
  });

  const renderer = resolveDashboardTabRenderer('prompt_settings');
  assert.ok(renderer);

  const rendered = renderer({
    sessions: [],
    refreshSessions: () => undefined,
    refreshPluginExtensions: () => undefined,
  });

  assert.ok(React.isValidElement(rendered));
  assert.equal(rendered.type, PromptSettings);
});
