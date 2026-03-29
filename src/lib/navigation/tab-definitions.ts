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
} as const;

export type CoreTabId = (typeof TAB_IDS)[keyof typeof TAB_IDS];
export type TabId = CoreTabId | (string & {});

export type TabSection = 'core' | 'plugins';

export type TabRenderContext = {
  sessions: JudoSession[];
  refreshSessions: () => void;
  refreshPluginExtensions: () => void | Promise<void>;
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
    id: TAB_IDS.dashboard,
    title: 'Dashboard',
    headerTitle: 'Dashboard: Training Overview',
    icon: LayoutDashboard,
    section: 'core',
    render: ({ sessions }) =>
      React.createElement(DashboardOverview, { sessions }),
  },
  {
    id: TAB_IDS.log,
    title: 'Log Session',
    headerTitle: 'Log A Practice Session',
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
    id: TAB_IDS.pluginManager,
    title: 'Plugins',
    headerTitle: 'Plugin Manager',
    icon: Puzzle,
    section: 'core',
    render: ({ refreshPluginExtensions }) =>
      React.createElement(PluginManager, {
        onPluginsChanged: refreshPluginExtensions,
      }),
    isVisible: () => pluginManagerFeatureFlagEnabled,
  },
] as const;

const pluginTabIcons: Record<string, LucideIcon> = {
  tags: Tags,
  brain: BrainCircuit,
  github: Github,
};

export const resolveDashboardExtensionsToTabs = async (
  extensions: ResolvedDashboardTabExtension[]
): Promise<DashboardTabResolutionResult> => {
  const warnings: PluginRuntimeWarning[] = [];

  const tabs: TabDefinition[] = [];

  for (const { extension, pluginId, capabilities } of extensions) {
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
      continue;
    }

    const render = await resolveDashboardTabRenderer(
      extension.config.component
    );
    if (!render) {
      warnings.push(
        createUnresolvedDashboardComponentWarning(
          extension.config.component,
          pluginId,
          extension.id
        )
      );
      continue;
    }

    tabs.push({
      id: extension.config.tabId,
      title: extension.title,
      headerTitle: extension.config.headerTitle,
      icon: pluginTabIcons[extension.config.icon ?? ''] ?? Tags,
      section: 'plugins',
      render,
    });
  }

  return { tabs, warnings };
};

export const mapDashboardExtensionsToTabs = async (
  extensions: ResolvedDashboardTabExtension[],
  options: MapDashboardExtensionsOptions = {}
): Promise<TabDefinition[]> => {
  const { tabs, warnings } = await resolveDashboardExtensionsToTabs(extensions);
  warnings.forEach((warning) => {
    options.onWarning?.(warning);
    console.warn('Plugin runtime warning', warning);
  });

  return tabs;
};
