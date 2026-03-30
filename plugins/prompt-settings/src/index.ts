import React from 'react';

import { PromptSettings } from './components/prompt-settings';
import { type DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';

export type PluginContext = {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (
    componentId: string,
    renderer: DashboardTabRenderer
  ) => void;
};

export const initPlugin = (context: PluginContext): void => {
  context.register?.('prompt-settings-dashboard-tab');
  context.registerPluginComponent?.('prompt_settings', () =>
    React.createElement(PromptSettings)
  );
};
