import { testPluginRegistrationContract } from '../../test-plugin-registration-contract';

import { initPlugin } from './index';

testPluginRegistrationContract({
  pluginId: 'prompt-settings',
  dashboardExtensionId: 'prompt-settings-dashboard-tab',
  componentId: 'prompt_settings',
  initPlugin,
});
