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
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        'source' in e &&
        e.source === source
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
        'source' in entry &&
        (entry.names as readonly string[]).includes(primitiveName)
      ) {
        return entry.source;
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

export type MaturityPrimitiveCriterion =
  | 'uiStates'
  | 'shells'
  | 'sections'
  | 'destructiveActions'
  | 'dataSurfaces';

export interface MaturityPrimitiveEvidence {
  criterion: MaturityPrimitiveCriterion;
  source: string;
  primitives: string[];
}

/**
 * Detect maturity-policy primitives imported by a plugin component.
 *
 * Only named imports from the documented shared modules count as evidence;
 * similarly named local components do not satisfy the policy.
 */
export const detectMaturityPrimitiveEvidence = (
  sourceText: string
): MaturityPrimitiveEvidence[] => {
  const evidence = new Map<
    MaturityPrimitiveCriterion,
    MaturityPrimitiveEvidence
  >();
  const importPattern = /import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/g;

  for (const match of sourceText.matchAll(importPattern)) {
    const importedNames = match[1].split(',').map((specifier) =>
      specifier
        .trim()
        .split(/\s+as\s+/)[0]
        .trim()
    );
    const source = match[2];

    for (const [criterion, configuration] of Object.entries(
      MATURITY_PRIMITIVES
    )) {
      if (
        typeof configuration !== 'object' ||
        configuration === null ||
        !('source' in configuration) ||
        !('names' in configuration) ||
        configuration.source !== source
      ) {
        continue;
      }

      const primitives = importedNames.filter((name) =>
        (configuration.names as readonly string[]).includes(name)
      );
      if (primitives.length === 0) continue;

      const typedCriterion = criterion as MaturityPrimitiveCriterion;
      const existing = evidence.get(typedCriterion);
      evidence.set(typedCriterion, {
        criterion: typedCriterion,
        source,
        primitives: [...(existing?.primitives ?? []), ...primitives],
      });
    }
  }

  return [...evidence.values()];
};
