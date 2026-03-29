import { registerPluginComponent } from '@/lib/plugins/dashboard-tab-adapters';

let pluginComponentRegistryInitialized = false;
let pluginComponentRegistryInitializationInFlight: Promise<void> | null = null;

type PluginInitializer = (context: {
  register: () => undefined;
  registerPluginComponent: typeof registerPluginComponent;
}) => void | Promise<void>;

/**
 * Plugins are registered by importing and initializing them here.
 * Each plugin should have a src/index.ts file that exports an initPlugin function.
 *
 * To add a new plugin:
 * 1. Create a plugins/my-plugin/src/index.ts file
 * 2. Export an initPlugin function that accepts the registration context
 * 3. Add an import here and call initializePluginComponent with the plugin ID
 */
const initializePluginsStatically = async (): Promise<void> => {
  // Initialize tag-manager plugin
  try {
    // Use synchronous require for test/runtime compatibility
    // biome-ignore lint/security/noCommonJs: Plugin initialization requires synchronous loading
    const tagManagerModule = require('../../../plugins/tag-manager/src/index');
    const initPlugin = tagManagerModule.initPlugin as
      | PluginInitializer
      | undefined;

    if (initPlugin && typeof initPlugin === 'function') {
      const initializationResult = initPlugin({
        register: () => undefined,
        registerPluginComponent,
      });
      if (initializationResult instanceof Promise) {
        await initializationResult;
      }
    }
  } catch (error) {
    console.warn('Failed to initialize tag-manager plugin:', error);
  }

  try {
    // Use synchronous require for test/runtime compatibility
    // biome-ignore lint/security/noCommonJs: Plugin initialization requires synchronous loading
    const githubSyncModule = require('../../../plugins/github-sync/src/index');
    const initPlugin = githubSyncModule.initPlugin as
      | PluginInitializer
      | undefined;

    if (initPlugin && typeof initPlugin === 'function') {
      const initializationResult = initPlugin({
        register: () => undefined,
        registerPluginComponent,
      });
      if (initializationResult instanceof Promise) {
        await initializationResult;
      }
    }
  } catch (error) {
    console.warn('Failed to initialize github-sync plugin:', error);
  }

  try {
    // Use synchronous require for test/runtime compatibility
    // biome-ignore lint/security/noCommonJs: Plugin initialization requires synchronous loading
    const promptSettingsModule = require('../../../plugins/prompt-settings/src/index');
    const initPlugin = promptSettingsModule.initPlugin as
      | PluginInitializer
      | undefined;

    if (initPlugin && typeof initPlugin === 'function') {
      const initializationResult = initPlugin({
        register: () => undefined,
        registerPluginComponent,
      });
      if (initializationResult instanceof Promise) {
        await initializationResult;
      }
    }
  } catch (error) {
    console.warn('Failed to initialize prompt-settings plugin:', error);
  }

  try {
    // Use synchronous require for test/runtime compatibility
    // biome-ignore lint/security/noCommonJs: Plugin initialization requires synchronous loading
    const logDoctorModule = require('../../../plugins/log-doctor/src/index');
    const initPlugin = logDoctorModule.initPlugin as
      | PluginInitializer
      | undefined;

    if (initPlugin && typeof initPlugin === 'function') {
      const initializationResult = initPlugin({
        register: () => undefined,
        registerPluginComponent,
      });
      if (initializationResult instanceof Promise) {
        await initializationResult;
      }
    }
  } catch (error) {
    console.warn('Failed to initialize log-doctor plugin:', error);
  }

  // To add more plugins:
  // 1. Create plugins/my-plugin/src/index.ts with initPlugin export
  // 2. Add another try-catch block here to initialize it:
  //
  // try {
  //   const myPluginModule = require('../../../plugins/my-plugin/src/index');
  //   const initPlugin = myPluginModule.initPlugin as PluginInitializer | undefined;
  //   if (initPlugin && typeof initPlugin === 'function') {
  //     initPlugin({
  //       register: () => undefined,
  //       registerPluginComponent,
  //     });
  //   }
  // } catch (error) {
  //   console.warn('Failed to initialize my-plugin:', error);
  // }
};

export const initializePluginComponentRegistry = async (): Promise<void> => {
  if (pluginComponentRegistryInitialized) {
    return;
  }

  if (pluginComponentRegistryInitializationInFlight) {
    return pluginComponentRegistryInitializationInFlight;
  }

  pluginComponentRegistryInitializationInFlight = (async () => {
    await initializePluginsStatically();
    pluginComponentRegistryInitialized = true;
  })().finally(() => {
    pluginComponentRegistryInitializationInFlight = null;
  });

  return pluginComponentRegistryInitializationInFlight;
};

export const resetPluginComponentRegistryInitializationForTests = (): void => {
  pluginComponentRegistryInitialized = false;
  pluginComponentRegistryInitializationInFlight = null;
};
