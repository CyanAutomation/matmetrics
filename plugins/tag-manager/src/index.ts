import React from 'react';

import { TagManager } from '@/components/tag-manager';
import { type DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';

export type PluginContext = {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (
    componentId: string,
    renderer: DashboardTabRenderer
  ) => void;
};

export const initPlugin = (context: PluginContext): void => {
  context.register?.('tag-manager-dashboard-tab');
  context.registerPluginComponent?.('tag_manager', ({ refreshSessions }) =>
    React.createElement(TagManager, { onRefresh: refreshSessions })
  );
};
