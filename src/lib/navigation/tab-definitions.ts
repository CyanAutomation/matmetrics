import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  History,
  Tags,
  BrainCircuit,
  Github,
  type LucideIcon,
} from 'lucide-react';

import { DashboardOverview } from '@/components/dashboard-overview';
import { SessionLogForm } from '@/components/session-log-form';
import { SessionHistory } from '@/components/session-history';
import { TagManager } from '@/components/tag-manager';
import { PromptSettings } from '@/components/prompt-settings';
import { GitHubSettings } from '@/components/github-settings';
import { JudoSession } from '@/lib/types';
import { type ResolvedDashboardTabExtension } from '@/lib/plugins/types';

export const TAB_IDS = {
  dashboard: 'dashboard',
  log: 'log',
  history: 'history',
  prompt: 'prompt',
  github: 'github',
  tags: 'tags',
} as const;

export type CoreTabId = (typeof TAB_IDS)[keyof typeof TAB_IDS];
export type TabId = CoreTabId | (string & {});

export type TabSection = 'core' | 'plugins';

export type TabRenderContext = {
  sessions: JudoSession[];
  refreshSessions: () => void;
};

export type TabVisibilityContext = {
  hasUser: boolean;
  isGuest: boolean;
  authAvailable: boolean;
};

export type TabDefinition = {
  id: TabId;
  title: string;
  headerTitle: string;
  icon: LucideIcon;
  section: TabSection;
  render: (context: TabRenderContext) => React.ReactNode;
  isVisible?: (context: TabVisibilityContext) => boolean;
};

export const coreTabs: ReadonlyArray<TabDefinition> = [
  {
    id: TAB_IDS.dashboard,
    title: 'Dashboard',
    headerTitle: 'Training Overview',
    icon: LayoutDashboard,
    section: 'core',
    render: ({ sessions }) =>
      React.createElement(DashboardOverview, { sessions }),
  },
  {
    id: TAB_IDS.log,
    title: 'Log Session',
    headerTitle: 'Log Practice',
    icon: PlusCircle,
    section: 'core',
    render: ({ refreshSessions }) =>
      React.createElement(SessionLogForm, { onSuccess: refreshSessions }),
  },
  {
    id: TAB_IDS.history,
    title: 'History',
    headerTitle: 'Session History',
    icon: History,
    section: 'core',
    render: ({ sessions, refreshSessions }) =>
      React.createElement(
        'div',
        { className: 'max-w-4xl mx-auto' },
        React.createElement(SessionHistory, {
          sessions,
          onRefresh: refreshSessions,
        })
      ),
  },
  {
    id: TAB_IDS.prompt,
    title: 'Prompt Settings',
    headerTitle: 'AI Prompt Configuration',
    icon: BrainCircuit,
    section: 'core',
    render: () => React.createElement(PromptSettings),
  },
  {
    id: TAB_IDS.github,
    title: 'GitHub Sync',
    headerTitle: 'GitHub Sync Configuration',
    icon: Github,
    section: 'core',
    render: () => React.createElement(GitHubSettings),
  },
] as const;

const pluginTabIcons: Record<string, LucideIcon> = {
  tags: Tags,
};

const pluginTabRenderers: Record<
  string,
  (context: TabRenderContext) => React.ReactNode
> = {
  tag_manager: ({ refreshSessions }) =>
    React.createElement(TagManager, { onRefresh: refreshSessions }),
};

export const mapDashboardExtensionsToTabs = (
  extensions: ResolvedDashboardTabExtension[]
): TabDefinition[] =>
  extensions.flatMap(({ extension }) => {
    const render = pluginTabRenderers[extension.config.component];
    if (!render) {
      return [];
    }

    return [
      {
        id: extension.config.tabId,
        title: extension.title,
        headerTitle: extension.config.headerTitle,
        icon: pluginTabIcons[extension.config.icon ?? ''] ?? Tags,
        section: 'plugins',
        render,
      },
    ];
  });
