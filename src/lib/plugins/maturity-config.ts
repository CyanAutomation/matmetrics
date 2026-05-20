/**
 * Centralized configuration for plugin maturity scoring.
 * Defines primitive names, sources, and helper methods for querying them.
 * This replaces hardcoded checks scattered throughout the scoring logic.
 */

export const MATURITY_PRIMITIVES = {
  uiStates: {
    source: '@/components/plugins/plugin-state',
    names: [
      'PluginLoadingState',
      'PluginErrorState',
      'PluginEmptyState',
    ] as const,
  },
  shells: {
    source: '@/components/plugins/plugin-page-shell',
    names: ['PluginPageShell'] as const,
  },
  sections: {
    source: '@/components/plugins/plugin-section-card',
    names: ['PluginSectionCard'] as const,
  },
  destructiveActions: {
    source: '@/components/plugins/plugin-destructive-action',
    names: ['PluginDestructiveAction'] as const,
  },
  dataSurfaces: {
    source: '@/components/plugins/plugin-data-surface',
    names: [
      'PluginDataSurfaceTable',
      'PluginDataSurfaceFilterRow',
      'PluginDataSurfaceSummaryStrip',
      'PluginEmptyFilteredResults',
    ] as const,
  },

  /**
   * Get all primitive names for a given source
   */
  getPrimitivesBySource(source: string): string[] | null {
    const entry = Object.values(MATURITY_PRIMITIVES).find(
      (e) => typeof e === 'object' && e !== null && 'source' in e && e.source === source
    );
    return entry && 'names' in entry ? [...entry.names] : null;
  },

  /**
   * Find the source module for a given primitive name
   */
  getSourceOfPrimitive(primitiveName: string): string | null {
    for (const entry of Object.values(MATURITY_PRIMITIVES)) {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'names' in entry &&
        entry.names.includes(primitiveName as any)
      ) {
        return (entry as any).source;
      }
    }
    return null;
  },

  /**
   * Check if a primitive name is a UI state component
   */
  isUiState(primitiveName: string): boolean {
    return MATURITY_PRIMITIVES.uiStates.names.includes(primitiveName as any);
  },
} as const;
