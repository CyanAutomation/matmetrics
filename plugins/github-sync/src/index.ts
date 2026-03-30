import React from 'react';

import { GitHubSettings } from './components/github-settings';
import { type DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';

export type PluginContext = {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (
    componentId: string,
    renderer: DashboardTabRenderer
  ) => void;
};

export const initPlugin = (context: PluginContext): void => {
  context.register?.('github-sync-dashboard-tab');
  context.registerPluginComponent?.('github_settings', () =>
    React.createElement(GitHubSettings)
  );
};
