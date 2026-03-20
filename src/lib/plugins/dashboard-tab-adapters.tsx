import React from 'react';

import { initializePluginComponentRegistry } from '@/lib/plugins/plugin-component-bootstrap';
import { type PluginRuntimeWarning } from '@/lib/plugins/types';
import { type TabRenderContext } from '@/lib/navigation/tab-definitions';

export type DashboardTabRenderer = (
  context: TabRenderContext
) => React.ReactNode;

export type PluginComponentRegistration = {
  componentId: string;
  renderer: DashboardTabRenderer;
};

const dashboardTabRenderers = new Map<string, DashboardTabRenderer>();

export const registerPluginComponent = (
  componentId: string,
  renderer: DashboardTabRenderer
): PluginComponentRegistration => {
  dashboardTabRenderers.set(componentId, renderer);
  return { componentId, renderer };
};

export const resolveDashboardTabRenderer = (
  componentId: string
): DashboardTabRenderer | null => {
  initializePluginComponentRegistry();
  return dashboardTabRenderers.get(componentId) ?? null;
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

export const clearDashboardTabRendererRegistryForTests = (): void => {
  dashboardTabRenderers.clear();
};
