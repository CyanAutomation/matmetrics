import githubSyncManifest from './github-sync/plugin.json';
import { initPlugin as initGithubSyncPlugin } from './github-sync/src';
import logDoctorManifest from './log-doctor/plugin.json';
import { initPlugin as initLogDoctorPlugin } from './log-doctor/src';
import promptSettingsManifest from './prompt-settings/plugin.json';
import { initPlugin as initPromptSettingsPlugin } from './prompt-settings/src';
import tagManagerManifest from './tag-manager/plugin.json';
import { initPlugin as initTagManagerPlugin } from './tag-manager/src';
import videoLibraryManifest from './video-library/plugin.json';
import { initPlugin as initVideoLibraryPlugin } from './video-library/src';
import sessionTypesManifest from './session-types/plugin.json';
import { initPlugin as initSessionTypesPlugin } from './session-types/src';
import { testPluginManifestContract } from './test-plugin-manifest-contract';
import { testPluginRegistrationContract } from './test-plugin-registration-contract';

const REQUIREMENT_SOURCES = {
  pluginRegistrationContract: 'docs/plugin-contract.md#registration',
  pluginManifestContract: 'docs/plugin-contract.md#manifest',
} as const;

type PluginContractFixture = {
  pluginId: string;
  dashboardExtensionId: string;
  componentId: string;
  manifest: unknown;
  initPlugin: (context: {
    register?: (extensionId: string) => void;
    registerPluginComponent?: (componentId: string, renderer?: unknown) => void;
  }) => void;
};

const pluginContractFixtures: readonly PluginContractFixture[] = [
  {
    pluginId: 'github-sync',
    dashboardExtensionId: 'github-sync-dashboard-tab',
    componentId: 'github_settings',
    manifest: githubSyncManifest,
    initPlugin: initGithubSyncPlugin,
  },
  {
    pluginId: 'log-doctor',
    dashboardExtensionId: 'log-doctor-dashboard-tab',
    componentId: 'log_doctor',
    manifest: logDoctorManifest,
    initPlugin: initLogDoctorPlugin,
  },
  {
    pluginId: 'prompt-settings',
    dashboardExtensionId: 'prompt-settings-dashboard-tab',
    componentId: 'prompt_settings',
    manifest: promptSettingsManifest,
    initPlugin: initPromptSettingsPlugin,
  },
  {
    pluginId: 'tag-manager',
    dashboardExtensionId: 'tag-manager-dashboard-tab',
    componentId: 'tag_manager',
    manifest: tagManagerManifest,
    initPlugin: initTagManagerPlugin,
  },
  {
    pluginId: 'video-library',
    dashboardExtensionId: 'video-library-dashboard-tab',
    componentId: 'video_library',
    manifest: videoLibraryManifest,
    initPlugin: initVideoLibraryPlugin,
  },
  {
    pluginId: 'session-types',
    dashboardExtensionId: 'session-types-dashboard-tab',
    componentId: 'session_types',
    manifest: sessionTypesManifest,
    initPlugin: initSessionTypesPlugin,
  },
] as const;

for (const fixture of pluginContractFixtures) {
  testPluginRegistrationContract({
    ...fixture,
    requirementSource: REQUIREMENT_SOURCES.pluginRegistrationContract,
  });
  testPluginManifestContract({
    ...fixture,
    requirementSource: REQUIREMENT_SOURCES.pluginManifestContract,
  });
}
