import { testPluginRegistrationContract } from '../../test-plugin-registration-contract';

import { initPlugin } from './index';

testPluginRegistrationContract({
  pluginId: 'github-sync',
  dashboardExtensionId: 'github-sync-dashboard-tab',
  componentId: 'github_settings',
  initPlugin,
});
