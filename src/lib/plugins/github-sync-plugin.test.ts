import assert from 'node:assert/strict';
import test from 'node:test';

import { initPlugin } from '../../../plugins/github-sync/src/index';

const OPTIONAL_RUNTIME_HOOKS_REQUIREMENT =
  'docs/plugin-contract.md#registration';

test(`[req:${OPTIONAL_RUNTIME_HOOKS_REQUIREMENT}] github-sync initPlugin supports partial runtime contexts`, async (t) => {
  const cases = [
    { name: 'no hooks', supplyRegister: false, supplyComponentHook: false },
    { name: 'only register', supplyRegister: true, supplyComponentHook: false },
    {
      name: 'only registerPluginComponent',
      supplyRegister: false,
      supplyComponentHook: true,
    },
  ] as const;

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      const registerCalls: string[] = [];
      const componentCalls: Array<[string, unknown]> = [];
      const context = {
        ...(testCase.supplyRegister
          ? {
              register: (extensionId: string) => {
                registerCalls.push(extensionId);
              },
            }
          : {}),
        ...(testCase.supplyComponentHook
          ? {
              registerPluginComponent: (
                componentId: string,
                renderer: unknown
              ) => {
                componentCalls.push([componentId, renderer]);
              },
            }
          : {}),
      };

      initPlugin(context);

      assert.deepEqual(
        registerCalls,
        testCase.supplyRegister ? ['github-sync-dashboard-tab'] : []
      );
      assert.equal(componentCalls.length, testCase.supplyComponentHook ? 1 : 0);
      if (testCase.supplyComponentHook) {
        assert.equal(componentCalls[0]?.[0], 'github_settings');
        assert.equal(typeof componentCalls[0]?.[1], 'function');
      }
    });
  }
});
