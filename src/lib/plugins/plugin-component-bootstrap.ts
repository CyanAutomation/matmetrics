import { registerPluginComponent } from '@/lib/plugins/plugin-component-registry';

let pluginComponentRegistryInitialized = false;
let pluginComponentRegistryInitializationInFlight: Promise<void> | null = null;

type PluginInitializer = (context: {
  register: () => undefined;
  registerPluginComponent: typeof registerPluginComponent;
}) => void | Promise<void>;

type StaticPlugin = {
  id: string;
  load: () => { initPlugin?: PluginInitializer };
};

// Keep loading synchronous for test/runtime compatibility, while centralizing
// error isolation so one broken optional plugin cannot block the registry.
const staticPlugins: StaticPlugin[] = [
  {
    id: 'tag-manager',
    load: () => require('../../../plugins/tag-manager/src/index'),
  },
  {
    id: 'github-sync',
    load: () => require('../../../plugins/github-sync/src/index'),
  },
  {
    id: 'prompt-settings',
    load: () => require('../../../plugins/prompt-settings/src/index'),
  },
  {
    id: 'log-doctor',
    load: () => require('../../../plugins/log-doctor/src/index'),
  },
  {
    id: 'video-library',
    load: () => require('../../../plugins/video-library/src/index'),
  },
  {
    id: 'session-types',
    load: () => require('../../../plugins/session-types/src/index'),
  },
];

const initializePlugin = async (plugin: StaticPlugin): Promise<void> => {
  try {
    const initPlugin = plugin.load().initPlugin;
    if (typeof initPlugin !== 'function') return;

    const result = initPlugin({
      register: () => undefined,
      registerPluginComponent,
    });
    if (result instanceof Promise) await result;
  } catch (error) {
    console.warn(`Failed to initialize ${plugin.id} plugin:`, error);
  }
};

const initializePluginsStatically = async (): Promise<void> => {
  for (const plugin of staticPlugins) {
    await initializePlugin(plugin);
  }
};

export const initializePluginComponentRegistry = async (): Promise<void> => {
  if (pluginComponentRegistryInitialized) return;
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
