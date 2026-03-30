import promptSettingsManifest from './plugin.json';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';

testPluginManifestContract({
  pluginId: 'prompt-settings',
  dashboardExtensionId: 'prompt-settings-dashboard-tab',
  componentId: 'prompt_settings',
  manifest: promptSettingsManifest,
});
