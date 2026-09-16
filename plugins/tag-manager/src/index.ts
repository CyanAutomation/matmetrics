import React from 'react';

import { TagManager } from './components/tag-manager';
import { type PluginContext } from '@/lib/plugins/plugin-lifecycle-types';

export const initPlugin = (context: PluginContext): void => {
  context.register?.('tag-manager-dashboard-tab');
  context.registerPluginComponent?.('tag_manager', ({ refreshSessions }) =>
    React.createElement(TagManager, { onRefresh: refreshSessions })
  );
};
