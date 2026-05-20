import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MATURITY_PRIMITIVES } from './maturity-config';

describe('maturity-config', () => {
  describe('MATURITY_PRIMITIVES', () => {
    it('should define UI state primitives', () => {
      assert.ok(MATURITY_PRIMITIVES.uiStates);
      assert.equal(
        MATURITY_PRIMITIVES.uiStates.source,
        '@/components/plugins/plugin-state'
      );
      assert.ok(Array.isArray(MATURITY_PRIMITIVES.uiStates.names));
      assert.ok(
        MATURITY_PRIMITIVES.uiStates.names.includes(
          'PluginLoadingState'
        )
      );
      assert.ok(MATURITY_PRIMITIVES.uiStates.names.includes('PluginErrorState'));
      assert.ok(MATURITY_PRIMITIVES.uiStates.names.includes('PluginEmptyState'));
    });

    it('should define PluginPageShell primitive', () => {
      assert.ok(MATURITY_PRIMITIVES.shells);
      assert.equal(
        MATURITY_PRIMITIVES.shells.source,
        '@/components/plugins/plugin-page-shell'
      );
      assert.ok(MATURITY_PRIMITIVES.shells.names.includes('PluginPageShell'));
    });

    it('should define section primitives', () => {
      assert.ok(MATURITY_PRIMITIVES.sections);
      assert.equal(
        MATURITY_PRIMITIVES.sections.source,
        '@/components/plugins/plugin-section-card'
      );
      assert.ok(Array.isArray(MATURITY_PRIMITIVES.sections.names));
    });

    it('should define destructive action primitives', () => {
      assert.ok(MATURITY_PRIMITIVES.destructiveActions);
      assert.ok(Array.isArray(MATURITY_PRIMITIVES.destructiveActions.names));
    });

    it('should define data surface primitives', () => {
      assert.ok(MATURITY_PRIMITIVES.dataSurfaces);
      assert.ok(Array.isArray(MATURITY_PRIMITIVES.dataSurfaces.names));
    });

    it('should provide helper method to get primitives by source', () => {
      assert.ok(MATURITY_PRIMITIVES.getPrimitivesBySource);
      const stateSource = MATURITY_PRIMITIVES.getPrimitivesBySource(
        '@/components/plugins/plugin-state'
      );
      assert.deepEqual(stateSource, MATURITY_PRIMITIVES.uiStates.names);
    });

    it('should provide helper method to find source of primitive name', () => {
      assert.ok(MATURITY_PRIMITIVES.getSourceOfPrimitive);
      const source = MATURITY_PRIMITIVES.getSourceOfPrimitive('PluginPageShell');
      assert.equal(source, '@/components/plugins/plugin-page-shell');
    });

    it('should provide helper method to check if primitive is a UI state', () => {
      assert.ok(MATURITY_PRIMITIVES.isUiState);
      assert.equal(MATURITY_PRIMITIVES.isUiState('PluginLoadingState'), true);
      assert.equal(MATURITY_PRIMITIVES.isUiState('PluginPageShell'), false);
    });

    it('should return null for unknown source in getPrimitivesBySource', () => {
      const result = MATURITY_PRIMITIVES.getPrimitivesBySource(
        '@/unknown/source'
      );
      assert.equal(result, null);
    });

    it('should return null for unknown primitive in getSourceOfPrimitive', () => {
      const source = MATURITY_PRIMITIVES.getSourceOfPrimitive('UnknownPrimitive');
      assert.equal(source, null);
    });
  });
});
