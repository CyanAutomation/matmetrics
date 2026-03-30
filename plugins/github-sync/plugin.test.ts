import githubSyncManifest from './plugin.json';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';

testPluginManifestContract({
  pluginId: 'github-sync',
  dashboardExtensionId: 'github-sync-dashboard-tab',
  componentId: 'github_settings',
  manifest: githubSyncManifest,
});
