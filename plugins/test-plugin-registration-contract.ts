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

    initPlugin({
      register: (extensionId) => {
        registerCalls.push(extensionId);
      },
      registerPluginComponent: (registeredComponentId) => {
        registerComponentCalls.push(registeredComponentId);
      },
    });

    assert.equal(registerCalls.length, 1);
    assert.equal(registerComponentCalls.length, 1);
    assert.deepEqual(registerCalls, [dashboardExtensionId]);
    assert.deepEqual(registerComponentCalls, [componentId]);
  });
};
