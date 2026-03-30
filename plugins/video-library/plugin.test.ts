import videoLibraryManifest from './plugin.json';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';

testPluginManifestContract({
  pluginId: 'video-library',
  dashboardExtensionId: 'video-library-dashboard-tab',
  componentId: 'video_library',
  manifest: videoLibraryManifest,
});
