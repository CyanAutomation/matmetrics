import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  detectMaturityPrimitiveEvidence,
  MATURITY_PRIMITIVES,
} from './maturity-config';

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

    it('detects table-driven maturity-policy evidence required by docs/plugin-ui-contract.md results/data presentation', () => {
      const cases = [
        {
          name: 'required shell section',
          sourceText:
            "import { PluginSectionCard } from '@/components/plugins/plugin-section-card';",
          expectedCriterion: 'sections',
          expectedPrimitive: 'PluginSectionCard',
        },
        {
          name: 'results/data presentation data surface',
          sourceText: `
            import {
              PluginDataSurfaceTable,
            } from '@/components/plugins/plugin-data-surface';

            export function Results() {
              return <PluginDataSurfaceTable columns={[]} rows={[]} />;
            }
          `,
          expectedCriterion: 'dataSurfaces',
          expectedPrimitive: 'PluginDataSurfaceTable',
        },
      ] as const;

      for (const testCase of cases) {
        assert.deepEqual(
          detectMaturityPrimitiveEvidence(testCase.sourceText),
          [
            {
              criterion: testCase.expectedCriterion,
              source: MATURITY_PRIMITIVES[testCase.expectedCriterion].source,
              primitives: [testCase.expectedPrimitive],
            },
          ],
          `${testCase.name} satisfies docs/plugin-ui-contract.md results/data presentation`
        );
      }
    });

    it('recognizes rendered standard UX states required by docs/plugin-ui-contract.md#standard-state-components', () => {
      const cases = [
        {
          name: 'loading-state criterion',
          primitive: 'PluginLoadingState',
          sourceText: `
            import { PluginLoadingState } from '@/components/plugins/plugin-state';

            export function Plugin() {
              return <PluginLoadingState />;
            }
          `,
        },
        {
          name: 'error-state criterion',
          primitive: 'PluginErrorState',
          sourceText: `
            import { PluginErrorState } from '@/components/plugins/plugin-state';

            export function Plugin() {
              return <PluginErrorState />;
            }
          `,
        },
        {
          name: 'empty-state criterion',
          primitive: 'PluginEmptyState',
          sourceText: `
            import { PluginEmptyState } from '@/components/plugins/plugin-state';

            export function Plugin() {
              return <PluginEmptyState />;
            }
          `,
        },
      ] as const;

      for (const testCase of cases) {
        assert.deepEqual(
          detectMaturityPrimitiveEvidence(testCase.sourceText),
          [
            {
              criterion: 'uiStates',
              source: '@/components/plugins/plugin-state',
              primitives: [testCase.primitive],
            },
          ],
          `${testCase.name} satisfies docs/plugin-ui-contract.md#standard-state-components`
        );
      }
    });

    it('does not recognize a similarly named unsupported UX state component', () => {
      const sourceText = `
        import { PluginLoadingStateIndicator } from '@/components/plugins/plugin-state';

        export function Plugin() {
          return <PluginLoadingStateIndicator />;
        }
      `;

      assert.deepEqual(detectMaturityPrimitiveEvidence(sourceText), []);
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
