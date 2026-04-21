import React from 'react';
import {
  LayoutDashboard,
  Puzzle,
  History,
  Tags,
  BrainCircuit,
  Github,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';

import { DashboardOverview } from '@/components/dashboard-overview';
import { PluginManager } from '@/components/plugin-manager';
import { SessionHistory } from '@/components/session-history';
import { JudoSession } from '@/lib/types';
import {
  createMissingCapabilityDashboardWarning,
  createUnresolvedDashboardComponentWarning,
  resolveDashboardTabRenderer,
} from '@/lib/plugins/dashboard-tab-adapters';
import { createPluginSurfaceRenderer } from '@/lib/plugins/plugin-surface';
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
  onLogSession?: () => void;
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
    headerTitle: 'Training Overview',
    icon: LayoutDashboard,
    section: 'core',
    render: ({ sessions, onLogSession }) =>
      React.createElement(DashboardOverview, { sessions, onLogSession }),
  },
  {
    id: TAB_IDS.history,
    title: 'Training History',
    headerTitle: 'Training History',
    icon: History,
    section: 'core',
    render: ({ sessions, refreshSessions, onLogSession }) =>
      React.createElement(
        'div',
        { className: 'max-w-4xl mx-auto' },
        React.createElement(SessionHistory, {
          sessions,
          onRefresh: refreshSessions,
          onLogSession,
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
  stethoscope: Stethoscope,
};

export const resolveDashboardExtensionsToTabs = async (
  extensions: ResolvedDashboardTabExtension[]
): Promise<DashboardTabResolutionResult> => {
  const warnings: PluginRuntimeWarning[] = [];

  const tabs: TabDefinition[] = [];

  for (const { extension, pluginId, capabilities, uiContract } of extensions) {
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

    const wrappedRender = createPluginSurfaceRenderer({
      pluginId,
      extensionId: extension.id,
      uiContract,
      renderer: render,
      onWarning: (warning) => {
        warnings.push(warning);
      },
    });

    tabs.push({
      id: extension.config.tabId,
      title: extension.title,
      headerTitle: extension.config.headerTitle,
      icon: pluginTabIcons[extension.config.icon ?? ''] ?? Tags,
      section: 'plugins',
      render: wrappedRender,
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
