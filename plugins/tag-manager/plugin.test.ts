import tagManagerManifest from './plugin.json';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';

testPluginManifestContract({
  pluginId: 'tag-manager',
  dashboardExtensionId: 'tag-manager-dashboard-tab',
  componentId: 'tag_manager',
  manifest: tagManagerManifest,
});
