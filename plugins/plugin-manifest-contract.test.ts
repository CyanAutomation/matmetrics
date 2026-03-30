import githubSyncManifest from './github-sync/plugin.json';
import logDoctorManifest from './log-doctor/plugin.json';
import promptSettingsManifest from './prompt-settings/plugin.json';
import tagManagerManifest from './tag-manager/plugin.json';
import videoLibraryManifest from './video-library/plugin.json';
import { testPluginManifestContract } from './test-plugin-manifest-contract';
const pluginManifestFixtures = [
  {
    manifest: githubSyncManifest,
    expectations: {
      pluginId: 'github-sync',
      dashboardExtensionId: 'github-sync-dashboard-tab',
      dashboardComponentId: 'github_settings',
    },
  },
  {
    manifest: logDoctorManifest,
    expectations: {
      pluginId: 'log-doctor',
      dashboardExtensionId: 'log-doctor-dashboard-tab',
      dashboardComponentId: 'log_doctor',
    },
  },
  {
    manifest: promptSettingsManifest,
    expectations: {
      pluginId: 'prompt-settings',
      dashboardExtensionId: 'prompt-settings-dashboard-tab',
      dashboardComponentId: 'prompt_settings',
    },
  },
  {
    manifest: tagManagerManifest,
    expectations: {
      pluginId: 'tag-manager',
      dashboardExtensionId: 'tag-manager-dashboard-tab',
      dashboardComponentId: 'tag_manager',
    },
  },
  {
    manifest: videoLibraryManifest,
    expectations: {
      pluginId: 'video-library',
      dashboardExtensionId: 'video-library-dashboard-tab',
      dashboardComponentId: 'video_library',
    },
  },
] as const;

for (const { manifest, expectations } of pluginManifestFixtures) {
  testPluginManifestContract({
    pluginId: expectations.pluginId,
    dashboardExtensionId: expectations.dashboardExtensionId,
    componentId: expectations.dashboardComponentId,
    manifest,
  });
}
