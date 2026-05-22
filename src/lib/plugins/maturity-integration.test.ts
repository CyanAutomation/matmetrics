import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MATURITY_PRIMITIVES } from './maturity-config';
import { EvidenceAccumulator } from './evidence-accumulator';
import { TierEvaluator } from './tier-evaluator';

/**
 * Integration tests for maturity scoring extractors.
 * Verifies that extracted components work together correctly.
 */

describe('Maturity Scoring Integration', () => {
  describe('Config + Accumulator + Evaluator', () => {
    it('should handle complete Bronze->Silver->Gold tier progression', () => {
      const evaluator = new TierEvaluator();

      // Bronze tier
      const bronzeAcc = new EvidenceAccumulator();
      bronzeAcc.addCategoryScore('contract_metadata', 5, 'explicit');
      bronzeAcc.addCategoryScore('runtime_integration', 3, 'heuristic');
      bronzeAcc.addCategoryScore('feature_quality', 2, 'heuristic');
      bronzeAcc.addCategoryScore('test_coverage', 2, 'none');
      bronzeAcc.addCategoryScore('operability_docs', 1, 'none');
      bronzeAcc.addEvidence('contract_metadata', 'explicit', 'Basic metadata');

      const bronzeTier = evaluator.evaluateTier(bronzeAcc.getCategoryScores());
      assert.equal(bronzeTier, 'bronze');

      // Silver tier
      const silverAcc = new EvidenceAccumulator();
      silverAcc.addCategoryScore('contract_metadata', 18, 'explicit');
      silverAcc.addCategoryScore('runtime_integration', 16, 'heuristic');
      silverAcc.addCategoryScore('feature_quality', 18, 'heuristic');
      silverAcc.addCategoryScore('test_coverage', 12, 'heuristic');
      silverAcc.addCategoryScore('operability_docs', 10, 'explicit');
      silverAcc.addEvidence('contract_metadata', 'explicit', 'Complete metadata');

      const silverTier = evaluator.evaluateTier(silverAcc.getCategoryScores());
      assert.equal(silverTier, 'silver');

      // Gold tier
      const goldAcc = new EvidenceAccumulator();
      goldAcc.addCategoryScore('contract_metadata', 20, 'explicit');
      goldAcc.addCategoryScore('runtime_integration', 20, 'explicit');
      goldAcc.addCategoryScore('feature_quality', 25, 'explicit');
      goldAcc.addCategoryScore('test_coverage', 20, 'explicit');
      goldAcc.addCategoryScore('operability_docs', 15, 'explicit');
      goldAcc.addEvidence('contract_metadata', 'explicit', 'All fields explicitly verified');
      goldAcc.addEvidence('runtime_integration', 'explicit', 'All exports verified');
      goldAcc.addEvidence('feature_quality', 'explicit', 'All UX states verified');
      goldAcc.addEvidence('test_coverage', 'explicit', 'Test assertions verified');
      goldAcc.addEvidence('operability_docs', 'explicit', 'Documentation verified');

      const goldTier = evaluator.evaluateTier(
        goldAcc.getCategoryScores(),
        goldAcc.getEvidence()
      );
      assert.strictEqual(goldTier, 'gold');
    });

    it('should use primitives registry in evidence collection', () => {
      const acc = new EvidenceAccumulator();

      // Simulate discovering UI state primitives
      const uiStateSource = MATURITY_PRIMITIVES.getPrimitivesBySource(
        '@/components/plugins/plugin-state'
      );
      assert.ok(uiStateSource);
      assert.ok(uiStateSource.includes('PluginLoadingState'));

      // Add evidence for each discovered primitive
      uiStateSource.forEach((primitive) => {
        acc.addEvidence(
          'feature_quality',
          'explicit',
          `${primitive} verified in tests`
        );
      });

      const evidence = acc.getEvidence();
      assert.ok(evidence.feature_quality.length >= 3);
    });

    it('should accumulate complete scoring snapshot', () => {
      const acc = new EvidenceAccumulator();

      // Simulate full plugin assessment
      acc.addCategoryScore('contract_metadata', 18, 'explicit');
      acc.addCategoryScore('runtime_integration', 20, 'explicit');
      acc.addCategoryScore('feature_quality', 20, 'explicit');
      acc.addCategoryScore('test_coverage', 15, 'heuristic');
      acc.addCategoryScore('operability_docs', 12, 'explicit');

      acc.addEvidence(
        'contract_metadata',
        'explicit',
        'plugin.json well-formed'
      );
      acc.addEvidence(
        'runtime_integration',
        'explicit',
        'registerPluginComponent calls found'
      );
      acc.addEvidence(
        'feature_quality',
        'explicit',
        'PluginLoadingState verified'
      );
      acc.addEvidence(
        'test_coverage',
        'heuristic',
        '.test.ts files detected'
      );
      acc.addEvidence('operability_docs', 'explicit', 'README found');

      acc.addReason('contract_metadata', 'Full metadata compliance');
      acc.addReason(
        'runtime_integration',
        'All required exports present'
      );
      acc.addReason('feature_quality', 'UX states explicitly verified');
      acc.addReason('test_coverage', 'Test files detected heuristically');
      acc.addReason('operability_docs', 'Documentation complete');

      acc.addNextAction('Increase test coverage');
      acc.addNextAction('Add integration tests');

      const summary = acc.getFinal();

      assert.equal(summary.totalScore, 85);
      assert.equal(summary.categoryScores.contract_metadata, 18);
      assert.equal(summary.categoryScores.runtime_integration, 20);
      assert.ok(summary.evidence.contract_metadata.length > 0);
      assert.ok(summary.reasons.contract_metadata);
      assert.ok(summary.nextActions.length > 0);
    });
  });

  describe('Primitives helper methods', () => {
    it('should identify UI states correctly', () => {
      const isLoading = MATURITY_PRIMITIVES.isUiState('PluginLoadingState');
      const isError = MATURITY_PRIMITIVES.isUiState('PluginErrorState');
      const isShell = MATURITY_PRIMITIVES.isUiState('PluginPageShell');

      assert.equal(isLoading, true);
      assert.equal(isError, true);
      assert.equal(isShell, false);
    });

    it('should resolve primitive sources for evidence linking', () => {
      const primitives = [
        'PluginLoadingState',
        'PluginErrorState',
        'PluginPageShell',
        'PluginSectionCard',
      ];

      for (const primitive of primitives) {
        const source = MATURITY_PRIMITIVES.getSourceOfPrimitive(primitive);
        assert.ok(source, `Should resolve source for ${primitive}`);
        assert.ok(source.startsWith('@/components/plugins/'));
      }
    });
  });
});
