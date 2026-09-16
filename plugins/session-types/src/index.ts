import React from 'react';

import { SessionTypes } from './components/session-types';
import { type PluginContext } from '@/lib/plugins/plugin-lifecycle-types';

export const initPlugin = (context: PluginContext): void => {
  context.register?.('session-types-dashboard-tab');
  context.registerPluginComponent?.('session_types', () =>
    React.createElement(SessionTypes)
  );
};
