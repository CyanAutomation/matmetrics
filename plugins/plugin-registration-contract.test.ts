import { testPluginRegistrationContract } from './test-plugin-registration-contract';

import { initPlugin as initLogDoctorPlugin } from './log-doctor/src';

testPluginRegistrationContract({
  pluginId: 'log-doctor',
  dashboardExtensionId: 'log-doctor-dashboard-tab',
  componentId: 'log_doctor',
  initPlugin: initLogDoctorPlugin,
});
