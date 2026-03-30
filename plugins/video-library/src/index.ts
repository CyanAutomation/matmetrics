import React from 'react';

import { VideoLibrary } from './components/video-library';
import { type DashboardTabRenderer } from '@/lib/plugins/dashboard-tab-adapters';

export type PluginContext = {
  register?: (extensionId: string) => void;
  registerPluginComponent?: (
    componentId: string,
    renderer: DashboardTabRenderer
  ) => void;
};

export const initPlugin = (context: PluginContext): void => {
  context.register?.('video-library-dashboard-tab');
  context.registerPluginComponent?.('video_library', ({ refreshSessions }) =>
    React.createElement(VideoLibrary, { onRefresh: refreshSessions })
  );
};
