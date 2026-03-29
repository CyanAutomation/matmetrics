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

export const testPluginRegistrationContract = ({
  pluginId,
  dashboardExtensionId,
  componentId,
  initPlugin,
}: PluginRegistrationContractParams): void => {
  test(`initPlugin registers ${pluginId} ids exactly once`, () => {
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

    assert.ok(registerInvocationCount > 0, 'initPlugin must call register');
    assert.ok(
      registerComponentInvocationCount > 0,
      'initPlugin must call registerPluginComponent'
    );
    assert.equal(registerCalls.length, 1);
    assert.equal(registerComponentCalls.length, 1);
    assert.deepEqual(registerCalls, [dashboardExtensionId]);
    assert.deepEqual(registerComponentCalls, [componentId]);
  });
};
