import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MATURITY_PRIMITIVES } from './maturity-config';

describe('maturity-config', () => {
  describe('MATURITY_PRIMITIVES', () => {
    it('defines every primitive group required by docs/plugin-ui-contract.md#required-shell-usage', () => {
      const groups = [
        {
          name: 'uiStates',
          source: '@/components/plugins/plugin-state',
          names: ['PluginLoadingState', 'PluginErrorState', 'PluginEmptyState'],
        },
        {
          name: 'shells',
          source: '@/components/plugins/plugin-page-shell',
          names: ['PluginPageShell'],
        },
        {
          name: 'sections',
          source: '@/components/plugins/plugin-section-card',
          names: ['PluginSectionCard'],
        },
        {
          name: 'destructiveActions',
          source: '@/components/plugins/plugin-destructive-action',
          names: ['PluginDestructiveAction'],
        },
        {
          name: 'dataSurfaces',
          source: '@/components/plugins/plugin-data-surface',
          names: [
            'PluginDataSurfaceTable',
            'PluginDataSurfaceFilterRow',
            'PluginDataSurfaceSummaryStrip',
            'PluginEmptyFilteredResults',
          ],
        },
      ] as const;

      for (const group of groups) {
        const configuredGroup = MATURITY_PRIMITIVES[group.name];

        assert.equal(configuredGroup.source, group.source, group.name);
        assert.deepEqual(configuredGroup.names, group.names, group.name);
        assert.deepEqual(
          MATURITY_PRIMITIVES.getPrimitivesBySource(group.source),
          group.names,
          group.name
        );
        for (const primitiveName of group.names) {
          assert.equal(
            MATURITY_PRIMITIVES.getSourceOfPrimitive(primitiveName),
            group.source,
            `${group.name}: ${primitiveName}`
          );
        }
      }
    });

    it('detects PluginSectionCard imports as satisfying docs/plugin-ui-contract.md#required-shell-usage', () => {
      const fixture =
        "import { PluginSectionCard } from '@/components/plugins/plugin-section-card';";
      const importMatch = fixture.match(
        /import\s*{\s*(\w+)\s*}\s*from\s*'([^']+)'/
      );

      assert.ok(importMatch, 'fixture should contain a named primitive import');
      const [, importedPrimitive, source] = importMatch;
      const detectedPrimitives =
        MATURITY_PRIMITIVES.getPrimitivesBySource(source);

      assert.ok(
        detectedPrimitives?.includes(importedPrimitive),
        'PluginSectionCard satisfies docs/plugin-ui-contract.md#required-shell-usage'
      );
    });

    it('should provide helper method to check if primitive is a UI state', () => {
      assert.equal(MATURITY_PRIMITIVES.isUiState('PluginLoadingState'), true);
      assert.equal(MATURITY_PRIMITIVES.isUiState('PluginPageShell'), false);
    });

    it('should return null for unknown source in getPrimitivesBySource', () => {
      const result =
        MATURITY_PRIMITIVES.getPrimitivesBySource('@/unknown/source');
      assert.equal(result, null);
    });

    it('should return null for unknown primitive in getSourceOfPrimitive', () => {
      const source =
        MATURITY_PRIMITIVES.getSourceOfPrimitive('UnknownPrimitive');
      assert.equal(source, null);
    });
  });
});
