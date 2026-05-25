import { testPluginRegistrationContract } from './test-plugin-registration-contract';

import { initPlugin as initGithubSyncPlugin } from './github-sync/src';
import { initPlugin as initLogDoctorPlugin } from './log-doctor/src';
import { initPlugin as initPromptSettingsPlugin } from './prompt-settings/src';
import { initPlugin as initTagManagerPlugin } from './tag-manager/src';
import { initPlugin as initVideoLibraryPlugin } from './video-library/src';

const registrationSuites = [
  {
    pluginId: 'github-sync',
    dashboardExtensionId: 'github-sync-dashboard-tab',
    componentId: 'github_settings',
    initPlugin: initGithubSyncPlugin,
  },
  {
    pluginId: 'log-doctor',
    dashboardExtensionId: 'log-doctor-dashboard-tab',
    componentId: 'log_doctor',
    initPlugin: initLogDoctorPlugin,
  },
  {
    pluginId: 'prompt-settings',
    dashboardExtensionId: 'prompt-settings-dashboard-tab',
    componentId: 'prompt_settings',
    initPlugin: initPromptSettingsPlugin,
  },
  {
    pluginId: 'tag-manager',
    dashboardExtensionId: 'tag-manager-dashboard-tab',
    componentId: 'tag_manager',
    initPlugin: initTagManagerPlugin,
  },
  {
    pluginId: 'video-library',
    dashboardExtensionId: 'video-library-dashboard-tab',
    componentId: 'video_library',
    initPlugin: initVideoLibraryPlugin,
  },
] as const;

for (const registrationSuite of registrationSuites) {
  testPluginRegistrationContract(registrationSuite);
}
