import { testPluginRegistrationContract } from '../../test-plugin-registration-contract';

import { initPlugin } from './index';

testPluginRegistrationContract({
  pluginId: 'log-doctor',
  dashboardExtensionId: 'log-doctor-dashboard-tab',
  componentId: 'log_doctor',
  initPlugin,
});
