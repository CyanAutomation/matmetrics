import React from 'react';
import {
  LayoutDashboard,
  Puzzle,
  PlusCircle,
  History,
  Tags,
  BrainCircuit,
  Github,
  type LucideIcon,
} from 'lucide-react';

import { DashboardOverview } from '@/components/dashboard-overview';
import { PluginManager } from '@/components/plugin-manager';
import { SessionLogForm } from '@/components/session-log-form';
import { SessionHistory } from '@/components/session-history';
import { PromptSettings } from '@/components/prompt-settings';
import { GitHubSettings } from '@/components/github-settings';
import { JudoSession } from '@/lib/types';
import {
  createMissingCapabilityDashboardWarning,
  createUnresolvedDashboardComponentWarning,
  resolveDashboardTabRenderer,
} from '@/lib/plugins/dashboard-tab-adapters';
import {
  getRequiredCapabilityForExtension,
  hasCapability,
} from '@/lib/plugins/capabilities';
import {
  type PluginRuntimeWarning,
  type ResolvedDashboardTabExtension,
} from '@/lib/plugins/types';

export const TAB_IDS = {
  pluginManager: 'plugin_manager',
  dashboard: 'dashboard',
  log: 'log',
  history: 'history',
  prompt: 'prompt',
  github: 'github',
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

export type DashboardTabResolutionResult = {
  tabs: TabDefinition[];
  warnings: PluginRuntimeWarning[];
};

export type MapDashboardExtensionsOptions = {
  onWarning?: (warning: PluginRuntimeWarning) => void;
};

const pluginManagerFeatureFlagEnabled =
  process.env.NEXT_PUBLIC_ENABLE_PLUGIN_MANAGER !== 'false';

export const coreTabs: ReadonlyArray<TabDefinition> = [
  {
    id: TAB_IDS.pluginManager,
    title: 'Plugin Manager',
    headerTitle: 'Plugin Manager',
    icon: Puzzle,
    section: 'core',
    render: () => React.createElement(PluginManager),
    isVisible: () => pluginManagerFeatureFlagEnabled,
  },
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

export const resolveDashboardExtensionsToTabs = (
  extensions: ResolvedDashboardTabExtension[]
): DashboardTabResolutionResult => {
  const warnings: PluginRuntimeWarning[] = [];

  const tabs: TabDefinition[] = extensions.flatMap(
    ({ extension, pluginId, capabilities }) => {
      const requiredCapability = getRequiredCapabilityForExtension(extension);
      if (
        requiredCapability &&
        !hasCapability(capabilities, requiredCapability)
      ) {
        warnings.push(
          createMissingCapabilityDashboardWarning(
            requiredCapability,
            pluginId,
            extension.id
          )
        );
        return [];
      }

      const render = resolveDashboardTabRenderer(extension.config.component);
      if (!render) {
        warnings.push(
          createUnresolvedDashboardComponentWarning(
            extension.config.component,
            pluginId,
            extension.id
          )
        );
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
    }
  );

  return { tabs, warnings };
};

export const mapDashboardExtensionsToTabs = (
  extensions: ResolvedDashboardTabExtension[],
  options: MapDashboardExtensionsOptions = {}
): TabDefinition[] => {
  const { tabs, warnings } = resolveDashboardExtensionsToTabs(extensions);
  warnings.forEach((warning) => {
    options.onWarning?.(warning);
    console.warn('Plugin runtime warning', warning);
  });

  return tabs;
};
