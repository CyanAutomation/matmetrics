import React from 'react';

import { PromptSettings } from './components/prompt-settings';
import { type PluginContext } from '@/lib/plugins/plugin-lifecycle-types';

export const initPlugin = (context: PluginContext): void => {
  context.register?.('prompt-settings-dashboard-tab');
  context.registerPluginComponent?.('prompt_settings', () =>
    React.createElement(PromptSettings)
  );
};
