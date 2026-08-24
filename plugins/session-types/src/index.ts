import React from 'react';

import { type DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';
import { SessionTypes } from './components/session-types';

export type PluginContext = {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (
    componentId: string,
    renderer: DashboardTabRenderer
  ) => void;
};

export const initPlugin = (context: PluginContext): void => {
  context.register?.('session-types-dashboard-tab');
  context.registerPluginComponent?.('session_types', () =>
    React.createElement(SessionTypes)
  );
};
