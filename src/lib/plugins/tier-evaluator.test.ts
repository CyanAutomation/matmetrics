import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TierEvaluator } from './tier-evaluator';

describe('TierEvaluator', () => {
  const evaluator = new TierEvaluator();

  describe('Bronze tier', () => {
    it('should promote to Bronze tier with low scores', () => {
      const scores = {
        contract_metadata: 5,
        runtime_integration: 3,
        feature_quality: 2,
        test_coverage: 2,
        operability_docs: 1,
      };

      const tier = evaluator.evaluateTier(scores);
      assert.equal(tier, 'bronze');
    });

    it('should assign Bronze tier as default when score below Silver threshold', () => {
      const scores = {
        contract_metadata: 15,
        runtime_integration: 10,
        feature_quality: 10,
        test_coverage: 10,
        operability_docs: 5,
      };

      const tier = evaluator.evaluateTier(scores);
      assert.equal(tier, 'bronze');
    });
  });

  describe('Silver tier', () => {
    it('should promote to Silver tier with sufficient scores', () => {
      const scores = {
        contract_metadata: 18,
        runtime_integration: 18,
        feature_quality: 20,
        test_coverage: 16,
        operability_docs: 15,
      };

      const tier = evaluator.evaluateTier(scores);
      assert.equal(tier, 'silver');
    });

    it('should require total score >= 70 for Silver', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 15,
        test_coverage: 10,
        operability_docs: 5,
      };

      const tier = evaluator.evaluateTier(scores);
      // Total = 70, should be silver
      assert.equal(tier, 'silver');
    });

    it('should stay Silver if any category is 0', () => {
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
    it('should promote to Gold tier with high scores and explicit evidence', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 25,
        test_coverage: 20,
        operability_docs: 15,
      };

      const evidence = {
        contract_metadata: ['Explicit verification'],
        runtime_integration: ['All exports verified'],
        feature_quality: ['All UX states explicitly tested'],
        test_coverage: ['Comprehensive test suite'],
        operability_docs: ['Full documentation'],
      };

      const tier = evaluator.evaluateTier(scores, evidence);
      assert.equal(tier, 'gold');
    });

    it('should require total score >= 85 for Gold', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 20,
        test_coverage: 14,
        operability_docs: 12,
      };

      const evidence = {
        contract_metadata: ['Explicit'],
        runtime_integration: ['Explicit'],
        feature_quality: ['Explicit'],
        test_coverage: ['Explicit'],
        operability_docs: ['Explicit'],
      };

      // Total = 86, but needs explicit in all categories
      const tier = evaluator.evaluateTier(scores, evidence);
      assert.equal(tier, 'gold');
    });

    it('should not promote to Gold without explicit evidence', () => {
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

      const tier = evaluator.evaluateTier(scores, evidence);
      assert.equal(tier, 'silver');
    });

    it('should not promote to Gold if any critical category is missing evidence', () => {
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

      const tier = evaluator.evaluateTier(scores, evidence);
      assert.equal(tier, 'silver');
    });
  });

  describe('Edge cases', () => {
    it('should handle missing evidence gracefully', () => {
      const scores = {
        contract_metadata: 18,
        runtime_integration: 18,
        feature_quality: 20,
        test_coverage: 16,
        operability_docs: 15,
      };

      const tier = evaluator.evaluateTier(scores, undefined);
      assert.equal(tier, 'silver');
    });

    it('should handle empty scores', () => {
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

    it('should handle partial evidence', () => {
      const scores = {
        contract_metadata: 20,
        runtime_integration: 20,
        feature_quality: 25,
        test_coverage: 20,
        operability_docs: 15,
      };

      const partialEvidence = {
        contract_metadata: ['Explicit'],
        feature_quality: ['Explicit'],
        // Other categories missing
      } as any;

      const tier = evaluator.evaluateTier(scores, partialEvidence);
      assert.ok(['silver', 'bronze'].includes(tier));
    });
  });
});
