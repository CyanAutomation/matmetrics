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

type PluginInitRegistrationAssertionParams = {
  pluginId: string;
  registerCalls: string[];
  registerComponentCalls: string[];
  registerInvocationCount: number;
  registerComponentInvocationCount: number;
  expectedDashboardExtensionId: string;
  expectedComponentId: string;
};

const assertPluginInitRegistration = ({
  pluginId,
  registerCalls,
  registerComponentCalls,
  registerInvocationCount,
  registerComponentInvocationCount,
  expectedDashboardExtensionId,
  expectedComponentId,
}: PluginInitRegistrationAssertionParams): void => {
  assert.ok(
    registerInvocationCount > 0,
    `[${pluginId}] initPlugin must call register`
  );
  assert.ok(
    registerComponentInvocationCount > 0,
    `[${pluginId}] initPlugin must call registerPluginComponent`
  );
  assert.equal(
    registerCalls.length,
    1,
    `[${pluginId}] initPlugin must register exactly one extension id`
  );
  assert.equal(
    registerComponentCalls.length,
    1,
    `[${pluginId}] initPlugin must register exactly one component id`
  );
  assert.deepEqual(
    registerCalls,
    [expectedDashboardExtensionId],
    `[${pluginId}] extension id mismatch`
  );
  assert.deepEqual(
    registerComponentCalls,
    [expectedComponentId],
    `[${pluginId}] component id mismatch`
  );
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

    assertPluginInitRegistration({
      pluginId,
      registerCalls,
      registerComponentCalls,
      registerInvocationCount,
      registerComponentInvocationCount,
      expectedDashboardExtensionId: dashboardExtensionId,
      expectedComponentId: componentId,
    });
  });
};
