import React from 'react';

import { type PluginContext } from '@/lib/plugins/plugin-lifecycle-types';
import { LogDoctor } from './components/log-doctor';

export type { PluginContext };

export const initPlugin = (context: PluginContext): void => {
  context.register?.('log-doctor-dashboard-tab');
  context.registerPluginComponent?.('log_doctor', () =>
    React.createElement(LogDoctor)
  );
};
