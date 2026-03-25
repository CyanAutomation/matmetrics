import assert from 'node:assert/strict';
import test from 'node:test';

import { initPlugin } from './index';

test('initPlugin registers prompt-settings ids exactly once', () => {
  const registerCalls: string[] = [];
  const registerComponentCalls: string[] = [];

  initPlugin({
    register: (extensionId) => {
      registerCalls.push(extensionId);
    },
    registerPluginComponent: (componentId) => {
      registerComponentCalls.push(componentId);
    },
  });

  assert.equal(registerCalls.length, 1);
  assert.equal(registerComponentCalls.length, 1);
  assert.deepEqual(registerCalls, ['prompt-settings-dashboard-tab']);
  assert.deepEqual(registerComponentCalls, ['prompt_settings']);
});
