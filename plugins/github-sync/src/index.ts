import React from 'react';

import { GitHubSettings } from './components/github-settings';
import { type PluginContext } from '@/lib/plugins/plugin-lifecycle-types';

export type { PluginContext };

export const initPlugin = (context: PluginContext): void => {
  context.register?.('github-sync-dashboard-tab');
  context.registerPluginComponent?.('github_settings', () =>
    React.createElement(GitHubSettings)
  );
};
