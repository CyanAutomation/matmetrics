import React from 'react';

import { TagManager } from '@/components/tag-manager';
import { type TabRenderContext } from '@/lib/navigation/tab-definitions';

export type DashboardTabRenderer = (
  context: TabRenderContext
) => React.ReactNode;

const dashboardTabRenderers: Record<string, DashboardTabRenderer> = {
  tag_manager: ({ refreshSessions }) =>
    React.createElement(TagManager, { onRefresh: refreshSessions }),
};

export const resolveDashboardTabRenderer = (
  componentId: string
): DashboardTabRenderer | null => dashboardTabRenderers[componentId] ?? null;
