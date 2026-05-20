'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  coreTabs,
  mapDashboardExtensionsToTabs,
  type TabDefinition,
  type TabId,
} from '@/lib/navigation/tab-definitions';
import { type ResolvedDashboardTabExtension } from '@/lib/plugins/types';
import { loadEnabledDashboardTabExtensions } from '@/lib/plugins/registry';
import { loadDashboardTabExtensions } from '@/lib/plugins/load-dashboard-tab-extensions';

/**
 * Manages plugin extension loading, tab resolution, and tab visibility
 */
export function usePluginTabs(deps?: {
  legacyPluginRegistryFallbackEnabled?: boolean;
  activeTab?: TabId;
  hasUser?: boolean;
  isGuest?: boolean;
  authAvailable?: boolean;
}) {
  const legacyPluginRegistryFallbackEnabled =
    deps?.legacyPluginRegistryFallbackEnabled ?? false;

  const [pluginExtensions, setPluginExtensions] = useState<
    ResolvedDashboardTabExtension[]
  >(() =>
    legacyPluginRegistryFallbackEnabled
      ? loadEnabledDashboardTabExtensions()
      : []
  );

  const [resolvedPluginTabs, setResolvedPluginTabs] = useState<TabDefinition[]>(
    []
  );

  // Resolve plugin tabs from extensions
  useEffect(() => {
    let cancelled = false;

    const resolvePluginTabs = async () => {
      const tabs = await mapDashboardExtensionsToTabs(pluginExtensions);
      if (!cancelled) {
        setResolvedPluginTabs(tabs);
      }
    };

    void resolvePluginTabs();

    return () => {
      cancelled = true;
    };
  }, [pluginExtensions]);

  // Compute all tabs (core + plugin)
  const allTabs = useMemo(
    () =>
      resolvedPluginTabs.length > 0
        ? [...coreTabs, ...resolvedPluginTabs]
        : [...coreTabs],
    [resolvedPluginTabs]
  );

  // Filter visible tabs based on visibility rules
  const visibleTabs = useMemo(
    () =>
      allTabs.filter(
        (tab) =>
          tab.isVisible?.({
            hasUser: deps?.hasUser ?? false,
            isGuest: deps?.isGuest ?? false,
            authAvailable: deps?.authAvailable ?? false,
          }) ?? true
      ),
    [allTabs, deps?.hasUser, deps?.isGuest, deps?.authAvailable]
  );

  // Get selected tab from visible tabs
  const selectedTab = useMemo(
    () => visibleTabs.find((tab) => tab.id === deps?.activeTab) ?? visibleTabs[0] ?? null,
    [visibleTabs, deps?.activeTab]
  );

  const refreshPluginExtensions = useCallback(async () => {
    const nextExtensions = await loadDashboardTabExtensions({
      useLegacyRegistryFallback: legacyPluginRegistryFallbackEnabled,
      fallbackLoader: loadEnabledDashboardTabExtensions,
    });

    setPluginExtensions(nextExtensions);
  }, [legacyPluginRegistryFallbackEnabled]);

  useEffect(() => {
    void refreshPluginExtensions();
  }, [refreshPluginExtensions]);

  return {
    allTabs,
    visibleTabs,
    selectedTab,
    pluginExtensions,
    resolvedPluginTabs,
    refreshPluginExtensions,
  };
}
