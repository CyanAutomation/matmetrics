import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceAccumulator } from './evidence-accumulator';
import type { PluginMaturityCategory } from './types';

describe('EvidenceAccumulator', () => {
  it('should initialize empty', () => {
    const acc = new EvidenceAccumulator();

    assert.deepEqual(acc.getCategoryScores(), {
      contract_metadata: 0,
      runtime_integration: 0,
      feature_quality: 0,
      test_coverage: 0,
      operability_docs: 0,
    });
    assert.deepEqual(acc.getEvidence(), {});
    assert.deepEqual(acc.getReasons(), {});
    assert.deepEqual(acc.getNextActions(), []);
  });

  it('should add category scores and reasons independently', () => {
    const acc = new EvidenceAccumulator();
    const categoryCases: Record<
      PluginMaturityCategory,
      { score: number; reason: string }
    > = {
      contract_metadata: { score: 18, reason: 'Valid contract metadata' },
      runtime_integration: { score: 20, reason: 'Runtime exports verified' },
      feature_quality: { score: 17, reason: 'Required UX states verified' },
      test_coverage: { score: 15, reason: 'Required tests present' },
      operability_docs: { score: 12, reason: 'Operational docs present' },
    };
    const categories = Object.keys(categoryCases) as PluginMaturityCategory[];

    for (const category of categories) {
      const scoresBefore = acc.getCategoryScores();
      const reasonsBefore = acc.getReasons();
      const { score, reason } = categoryCases[category];

      acc.addCategoryScore(category, score, 'explicit');
      acc.addReason(category, reason);

      const scoresAfter = acc.getCategoryScores();
      const reasonsAfter = acc.getReasons();
      assert.equal(scoresAfter[category], score);
      assert.equal(reasonsAfter[category], reason);

      for (const otherCategory of categories.filter(
        (item) => item !== category
      )) {
        assert.equal(scoresAfter[otherCategory], scoresBefore[otherCategory]);
        assert.equal(reasonsAfter[otherCategory], reasonsBefore[otherCategory]);
      }
    }

    assert.deepEqual(acc.getCategoryScores(), {
      contract_metadata: 18,
      runtime_integration: 20,
      feature_quality: 17,
      test_coverage: 15,
      operability_docs: 12,
    });
    assert.deepEqual(acc.getReasons(), {
      contract_metadata: 'Valid contract metadata',
      runtime_integration: 'Runtime exports verified',
      feature_quality: 'Required UX states verified',
      test_coverage: 'Required tests present',
      operability_docs: 'Operational docs present',
    });
  });

  it('should calculate total score from category scores', () => {
    const acc = new EvidenceAccumulator();

    acc.addCategoryScore('contract_metadata', 18, 'explicit');
    acc.addCategoryScore('runtime_integration', 20, 'heuristic');
    acc.addCategoryScore('feature_quality', 20, 'explicit');
    acc.addCategoryScore('test_coverage', 15, 'heuristic');
    acc.addCategoryScore('operability_docs', 12, 'explicit');

    assert.equal(acc.getTotalScore(), 85);
  });

  it('should add evidence for categories', () => {
    const acc = new EvidenceAccumulator();

    acc.addEvidence('contract_metadata', 'explicit', 'plugin.json found');
    acc.addEvidence('runtime_integration', 'heuristic', 'index.ts exports found');

    const evidence = acc.getEvidence();
    assert.ok(evidence.contract_metadata?.includes('plugin.json found'));
    assert.ok(evidence.runtime_integration?.includes('index.ts exports found'));
  });

  it('should add multiple evidence entries for same category', () => {
    const acc = new EvidenceAccumulator();

    acc.addEvidence('feature_quality', 'explicit', 'Loading state verified');
    acc.addEvidence('feature_quality', 'explicit', 'Error state verified');
    acc.addEvidence('feature_quality', 'heuristic', 'Empty state pattern detected');

    const evidence = acc.getEvidence();
    assert.equal(evidence.feature_quality?.length, 3);
    assert.ok(evidence.feature_quality?.includes('Loading state verified'));
    assert.ok(evidence.feature_quality?.includes('Error state verified'));
    assert.ok(evidence.feature_quality?.includes('Empty state pattern detected'));
  });

  it('should add reasons by category', () => {
    const acc = new EvidenceAccumulator();

    acc.addReason('contract_metadata', 'plugin.json has all required fields');
    acc.addReason('feature_quality', 'All UX states explicitly verified');

    const reasons = acc.getReasons();
    assert.equal(reasons.contract_metadata, 'plugin.json has all required fields');
    assert.equal(reasons.feature_quality, 'All UX states explicitly verified');
  });

  it('should override previous reason when adding new reason for same category', () => {
    const acc = new EvidenceAccumulator();

    acc.addReason('test_coverage', 'Tests found but not verified');
    acc.addReason('test_coverage', 'All required test files present');

    const reasons = acc.getReasons();
    assert.equal(reasons.test_coverage, 'All required test files present');
  });

  it('should add next actions', () => {
    const acc = new EvidenceAccumulator();

    acc.addNextAction('Add UX state assertions to tests');
    acc.addNextAction('Document plugin API surface');

    const actions = acc.getNextActions();
    assert.ok(actions.includes('Add UX state assertions to tests'));
    assert.ok(actions.includes('Document plugin API surface'));
    assert.equal(actions.length, 2);
  });

  it('should not duplicate next actions', () => {
    const acc = new EvidenceAccumulator();

    acc.addNextAction('Add unit tests');
    acc.addNextAction('Add unit tests');
    acc.addNextAction('Add integration tests');

    const actions = acc.getNextActions();
    assert.equal(actions.length, 2);
    assert.ok(actions.includes('Add unit tests'));
    assert.ok(actions.includes('Add integration tests'));
  });

  it('should provide final summary', () => {
    const acc = new EvidenceAccumulator();

    acc.addCategoryScore('contract_metadata', 18, 'explicit');
    acc.addCategoryScore('runtime_integration', 20, 'explicit');
    acc.addCategoryScore('feature_quality', 20, 'heuristic');
    acc.addCategoryScore('test_coverage', 15, 'heuristic');
    acc.addCategoryScore('operability_docs', 12, 'explicit');

    acc.addEvidence('contract_metadata', 'explicit', 'plugin.json found');
    acc.addReason('contract_metadata', 'Valid contract metadata');
    acc.addNextAction('Add comprehensive README');

    const summary = acc.getFinal();

    assert.deepEqual(summary.categoryScores, acc.getCategoryScores());
    assert.equal(summary.totalScore, 85);
    assert.deepEqual(summary.evidence, acc.getEvidence());
    assert.deepEqual(summary.reasons, acc.getReasons());
    assert.deepEqual(summary.nextActions, acc.getNextActions());
  });

  it('should provide safe immutability on reads', () => {
    const acc = new EvidenceAccumulator();

    acc.addCategoryScore('contract_metadata', 18, 'explicit');
    const scores1 = acc.getCategoryScores();
    const scores2 = acc.getCategoryScores();

    // Different object instances
    assert.notEqual(scores1, scores2);
    // Same content
    assert.deepEqual(scores1, scores2);
  });
});
