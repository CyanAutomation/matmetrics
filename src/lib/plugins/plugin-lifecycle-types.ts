import { type DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';

/**
 * Shared plugin context type used by all plugins.
 * Plugins receive this context during initialization to register themselves.
 */
export type PluginContext = {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (
    componentId: string,
    renderer: DashboardTabRenderer
  ) => void;
};
