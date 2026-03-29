import { testPluginRegistrationContract } from '../../test-plugin-registration-contract';

import { initPlugin } from './index';

testPluginRegistrationContract({
  pluginId: 'tag-manager',
  dashboardExtensionId: 'tag-manager-dashboard-tab',
  componentId: 'tag_manager',
  initPlugin,
});
