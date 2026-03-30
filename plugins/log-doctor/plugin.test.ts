import logDoctorManifest from './plugin.json';
import { testPluginManifestContract } from '../test-plugin-manifest-contract';

testPluginManifestContract({
  pluginId: 'log-doctor',
  dashboardExtensionId: 'log-doctor-dashboard-tab',
  componentId: 'log_doctor',
  manifest: logDoctorManifest,
});
