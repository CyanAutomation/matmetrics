import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PluginMaturityCategory } from './types';
import { TierEvaluator } from './tier-evaluator';

describe('TierEvaluator', () => {
  const evaluator = new TierEvaluator();
  const explicitEvidence = {
    contract_metadata: ['Explicit verification'],
    runtime_integration: ['All exports verified'],
    feature_quality: ['All UX states explicitly tested'],
    test_coverage: ['Comprehensive test suite'],
    operability_docs: ['Full documentation'],
  };

  it('assigns tiers immediately below, at, and above Silver and Gold thresholds', () => {
    // Keep these boundary cases aligned with the documented 70/85 thresholds
    // in src/lib/plugins/tier-evaluator.ts.
    const cases = [
      {
        name: 'one point below Silver',
        total: 69,
        scores: {
          contract_metadata: 14,
          runtime_integration: 14,
          feature_quality: 18,
          test_coverage: 13,
          operability_docs: 10,
        },
        expectedTier: 'bronze',
      },
      {
        name: 'at the Silver threshold',
        total: 70,
        scores: {
          contract_metadata: 14,
          runtime_integration: 14,
          feature_quality: 18,
          test_coverage: 14,
          operability_docs: 10,
        },
        expectedTier: 'silver',
      },
      {
        name: 'one point above Silver',
        total: 71,
        scores: {
          contract_metadata: 14,
          runtime_integration: 14,
          feature_quality: 18,
          test_coverage: 14,
          operability_docs: 11,
        },
        expectedTier: 'silver',
      },
      {
        name: 'one point below Gold',
        total: 84,
        scores: {
          contract_metadata: 17,
          runtime_integration: 17,
          feature_quality: 22,
          test_coverage: 16,
          operability_docs: 12,
        },
        expectedTier: 'silver',
      },
      {
        name: 'at the Gold threshold',
        total: 85,
        scores: {
          contract_metadata: 17,
          runtime_integration: 17,
          feature_quality: 22,
          test_coverage: 17,
          operability_docs: 12,
        },
        expectedTier: 'gold',
      },
      {
        name: 'one point above Gold',
        total: 86,
        scores: {
          contract_metadata: 17,
          runtime_integration: 17,
          feature_quality: 22,
          test_coverage: 17,
          operability_docs: 13,
        },
        expectedTier: 'gold',
      },
    ] as const;

    for (const testCase of cases) {
      assert.equal(
        Object.values(testCase.scores).reduce((sum, score) => sum + score, 0),
        testCase.total,
        `${testCase.name}: score fixture total`
      );
      assert.equal(
        evaluator.evaluateTier(testCase.scores, explicitEvidence),
        testCase.expectedTier,
        testCase.name
      );
    }
  });

  describe('Silver tier', () => {
    it('keeps a qualifying total at Silver when a category score is zero', () => {
      const scores = {
        contract_metadata: 0,
        runtime_integration: 20,
        feature_quality: 25,
        test_coverage: 20,
        operability_docs: 15,
      };

      const tier = evaluator.evaluateTier(scores);
      assert.equal(tier, 'silver');
    });
  });

  describe('Gold tier', () => {
    it('does not promote to Gold when critical evidence is heuristic only', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 25,
        test_coverage: 20,
        operability_docs: 15,
      };

      const evidence = {
        contract_metadata: ['Heuristic detection'],
        runtime_integration: ['Pattern matching'],
        feature_quality: ['File scan'],
        test_coverage: ['Heuristic'],
        operability_docs: ['README found'],
      };

      assert.equal(evaluator.evaluateTier(scores, evidence), 'silver');
    });

    it('does not promote to Gold when evidence is absent', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 25,
        test_coverage: 20,
        operability_docs: 15,
      };

      assert.equal(evaluator.evaluateTier(scores), 'silver');
    });

    it('does not promote to Gold when a critical category has no evidence', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 25,
        test_coverage: 20,
        operability_docs: 15,
      };

      const evidence = {
        contract_metadata: ['Explicit'],
        runtime_integration: [],
        feature_quality: ['Explicit'],
        test_coverage: ['Explicit'],
        operability_docs: ['Explicit'],
      };

      assert.equal(evaluator.evaluateTier(scores, evidence), 'silver');
    });
  });

  describe('Edge cases', () => {
    it('keeps all-zero scores at Bronze', () => {
      const scores = {
        contract_metadata: 0,
        runtime_integration: 0,
        feature_quality: 0,
        test_coverage: 0,
        operability_docs: 0,
      };

      const tier = evaluator.evaluateTier(scores);
      assert.equal(tier, 'bronze');
    });

    it('keeps partial evidence at Silver when a critical category is absent', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 25,
        test_coverage: 20,
        operability_docs: 15,
      };

      const partialEvidence: Partial<
        Record<PluginMaturityCategory, string[]>
      > = {
        contract_metadata: ['Explicit'],
        feature_quality: ['Explicit'],
        // Other categories missing
      };

      assert.equal(evaluator.evaluateTier(scores, partialEvidence), 'silver');
    });
  });
});
