import React from 'react';

import { type DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';

import { LogDoctor } from './components/log-doctor';

export type PluginContext = {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (
    componentId: string,
    renderer: DashboardTabRenderer
  ) => void;
};

export const initPlugin = (context: PluginContext): void => {
  context.register?.('log-doctor-dashboard-tab');
  context.registerPluginComponent?.('log_doctor', () =>
    React.createElement(LogDoctor)
  );
};
