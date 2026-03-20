import { initPlugin as initTagManagerPlugin } from '../../../plugins/tag-manager/src';

import { registerPluginComponent } from '@/lib/plugins/dashboard-tab-adapters';

let pluginComponentRegistryInitialized = false;

export const initializePluginComponentRegistry = (): void => {
  if (pluginComponentRegistryInitialized) {
    return;
  }

  initTagManagerPlugin({
    register: () => undefined,
    registerPluginComponent,
  });

  pluginComponentRegistryInitialized = true;
};

export const resetPluginComponentRegistryInitializationForTests = (): void => {
  pluginComponentRegistryInitialized = false;
};
