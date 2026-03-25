import assert from 'node:assert/strict';
import test from 'node:test';

import { initPlugin } from '../../../plugins/github-sync/src/index';

test('github-sync initPlugin registers github-sync-dashboard-tab', () => {
  const registeredExtensionIds: string[] = [];

  initPlugin({
    register: (extensionId) => {
      registeredExtensionIds.push(extensionId);
    },
    registerPluginComponent: () => {},
  });

  assert.deepEqual(registeredExtensionIds, ['github-sync-dashboard-tab']);
});

test('github-sync initPlugin registers github_settings component renderer', () => {
  const registeredComponents: string[] = [];

  initPlugin({
    registerPluginComponent: (componentId) => {
      registeredComponents.push(componentId);
    },
  });

  assert.deepEqual(registeredComponents, ['github_settings']);
});
