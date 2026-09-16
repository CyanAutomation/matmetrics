import React from 'react';

import { VideoLibrary } from './components/video-library';
import { type PluginContext } from '@/lib/plugins/plugin-lifecycle-types';

export const initPlugin = (context: PluginContext): void => {
  context.register?.('video-library-dashboard-tab');
  context.registerPluginComponent?.('video_library', ({ refreshSessions }) =>
    React.createElement(VideoLibrary, { onRefresh: refreshSessions })
  );
};
