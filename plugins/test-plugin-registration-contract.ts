import assert from 'node:assert/strict';
import test from 'node:test';

type InitPlugin = (context: {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (componentId: string, renderer?: unknown) => void;
}) => void;

type PluginRegistrationContractParams = {
  pluginId: string;
  dashboardExtensionId: string;
  componentId: string;
  initPlugin: InitPlugin;
};

type RegistrationCapture = {
  registerCalls: string[];
  registerComponentCalls: string[];
  registerInvocationCount: number;
  registerComponentInvocationCount: number;
};

const captureRegistration = (initPlugin: InitPlugin): RegistrationCapture => {
  const registerCalls: string[] = [];
  const registerComponentCalls: string[] = [];
  let registerInvocationCount = 0;
  let registerComponentInvocationCount = 0;

  initPlugin({
    register: (extensionId) => {
      registerInvocationCount += 1;
      registerCalls.push(extensionId);
    },
    registerPluginComponent: (registeredComponentId) => {
      registerComponentInvocationCount += 1;
      registerComponentCalls.push(registeredComponentId);
    },
  });

  return {
    registerCalls,
    registerComponentCalls,
    registerInvocationCount,
    registerComponentInvocationCount,
  };
};

const runRegistrationAssertions = ({
  pluginId,
  dashboardExtensionId,
  componentId,
  initPlugin,
}: PluginRegistrationContractParams): void => {
  const result = captureRegistration(initPlugin);

  assert.ok(
    result.registerInvocationCount > 0,
    `[${pluginId}] Contract violation: initPlugin must call context.register('<plugin>-dashboard-tab') so the runtime can expose the plugin tab.`
  );
  assert.ok(
    result.registerComponentInvocationCount > 0,
    `[${pluginId}] Contract violation: initPlugin must call context.registerPluginComponent('<component-id>', renderer) so the runtime can render the declared panel.`
  );
  assert.equal(
    result.registerCalls.length,
    1,
    `[${pluginId}] Contract violation: initPlugin must register exactly one dashboard extension id (duplicate registration creates ambiguous runtime routing).`
  );
  assert.equal(
    result.registerComponentCalls.length,
    1,
    `[${pluginId}] Contract violation: initPlugin must register exactly one component id (duplicate component registration can cause non-deterministic renderer selection).`
  );
  assert.deepEqual(
    result.registerCalls,
    [dashboardExtensionId],
    `[${pluginId}] Contract violation: dashboard extension id must match plugin manifest/runtime expectation.`
  );
  assert.deepEqual(
    result.registerComponentCalls,
    [componentId],
    `[${pluginId}] Contract violation: component id must match plugin manifest/runtime expectation.`
  );
};

export const testPluginRegistrationContract = (
  params: PluginRegistrationContractParams
): void => {
  test(`plugin registration contract :: ${params.pluginId}`, async (t) => {
    await t.test('happy path: registers expected ids exactly once', () => {
      runRegistrationAssertions(params);
    });

    await t.test('negative: missing register fails with clear contract message', () => {
      assert.throws(
        () => {
          params.initPlugin({
            registerPluginComponent: () => {
              // intentionally omit register to validate guardrail
            },
          });
          assert.fail(
            `[${params.pluginId}] Expected contract failure when context.register is unavailable.`
          );
        },
        /register/
      );
    });

    await t.test(
      'negative: missing registerPluginComponent fails with clear contract message',
      () => {
        assert.throws(
          () => {
            params.initPlugin({
              register: () => {
                // intentionally omit registerPluginComponent to validate guardrail
              },
            });
            assert.fail(
              `[${params.pluginId}] Expected contract failure when context.registerPluginComponent is unavailable.`
            );
          },
          /registerPluginComponent/
        );
      }
    );

    await t.test('negative: duplicate registration attempt is rejected', () => {
      assert.throws(
        () => {
          let extensionRegistered = false;
          let componentRegistered = false;
          params.initPlugin({
            register: (extensionId) => {
              if (extensionRegistered) {
                throw new Error(
                  `[${params.pluginId}] duplicate register('${extensionId}') call blocked by runtime`
                );
              }
              extensionRegistered = true;
            },
            registerPluginComponent: (registeredComponentId) => {
              if (componentRegistered) {
                throw new Error(
                  `[${params.pluginId}] duplicate registerPluginComponent('${registeredComponentId}') call blocked by runtime`
                );
              }
              componentRegistered = true;
            },
          });

          params.initPlugin({
            register: (extensionId) => {
              if (extensionRegistered) {
                throw new Error(
                  `[${params.pluginId}] duplicate register('${extensionId}') call blocked by runtime`
                );
              }
              extensionRegistered = true;
            },
            registerPluginComponent: (registeredComponentId) => {
              if (componentRegistered) {
                throw new Error(
                  `[${params.pluginId}] duplicate registerPluginComponent('${registeredComponentId}') call blocked by runtime`
                );
              }
              componentRegistered = true;
            },
          });
        },
        /duplicate register|duplicate registerPluginComponent/
      );
    });
  });
};
