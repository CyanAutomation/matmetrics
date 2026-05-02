import React from 'react';

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

export const getDashboardTabRenderer = (
  componentId: string
): DashboardTabRenderer | null =>
  dashboardTabRenderers.get(componentId) ?? null;

export const clearDashboardTabRendererRegistryForTests = (): void => {
  dashboardTabRenderers.clear();
};
