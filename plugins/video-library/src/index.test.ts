import { testPluginRegistrationContract } from '../../test-plugin-registration-contract';

import { initPlugin } from './index';

testPluginRegistrationContract({
  pluginId: 'video-library',
  dashboardExtensionId: 'video-library-dashboard-tab',
  componentId: 'video_library',
  initPlugin,
});
