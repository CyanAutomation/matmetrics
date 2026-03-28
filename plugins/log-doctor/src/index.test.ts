import assert from 'node:assert/strict';
import test from 'node:test';

import { initPlugin } from './index';

test('initPlugin registers log-doctor ids exactly once', () => {
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
  assert.deepEqual(registerCalls, ['log-doctor-dashboard-tab']);
  assert.deepEqual(registerComponentCalls, ['log_doctor']);
});
