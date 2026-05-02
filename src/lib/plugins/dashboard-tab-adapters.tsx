import { initializePluginComponentRegistry } from '@/lib/plugins/plugin-component-bootstrap';
import {
  type DashboardTabRenderer,
  type PluginComponentRegistration,
  getDashboardTabRenderer,
  registerPluginComponent,
  clearDashboardTabRendererRegistryForTests,
} from '@/lib/plugins/plugin-component-registry';
import { type PluginRuntimeWarning } from '@/lib/plugins/types';

export type { DashboardTabRenderer, PluginComponentRegistration };
export { getDashboardTabRenderer, registerPluginComponent, clearDashboardTabRendererRegistryForTests };

export const resolveDashboardTabRenderer = async (
  componentId: string
): Promise<DashboardTabRenderer | null> => {
  await initializePluginComponentRegistry();
  return getDashboardTabRenderer(componentId);
};

export const createUnresolvedDashboardComponentWarning = (
  componentId: string,
  pluginId: string,
  extensionId: string
): PluginRuntimeWarning => ({
  code: 'dashboard_tab_renderer_unresolved',
  severity: 'warning',
  path: `plugins.${pluginId}.uiExtensions.${extensionId}.config.component`,
  message: `Dashboard tab component \"${componentId}\" is not registered to a renderer.`,
  pluginId,
  extensionId,
  componentId,
});

export const createMissingCapabilityDashboardWarning = (
  requiredCapability: string,
  pluginId: string,
  extensionId: string
): PluginRuntimeWarning => ({
  code: 'dashboard_tab_missing_capability',
  severity: 'warning',
  path: `plugins.${pluginId}.capabilities`,
  message: `Dashboard extension "${extensionId}" requires capability "${requiredCapability}" and was not rendered.`,
  pluginId,
  extensionId,
});
