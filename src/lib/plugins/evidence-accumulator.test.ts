import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceAccumulator } from './evidence-accumulator';

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

  it('should add evidence for categories', () => {
    const acc = new EvidenceAccumulator();

    acc.addEvidence('contract_metadata', 'explicit', 'plugin.json found');
    acc.addEvidence(
      'runtime_integration',
      'heuristic',
      'index.ts exports found'
    );

    const evidence = acc.getEvidence();
    assert.ok(evidence.contract_metadata?.includes('plugin.json found'));
    assert.ok(evidence.runtime_integration?.includes('index.ts exports found'));
  });

  it('should add multiple evidence entries for same category', () => {
    const acc = new EvidenceAccumulator();

    acc.addEvidence('feature_quality', 'explicit', 'Loading state verified');
    acc.addEvidence('feature_quality', 'explicit', 'Error state verified');
    acc.addEvidence(
      'feature_quality',
      'heuristic',
      'Empty state pattern detected'
    );

    const evidence = acc.getEvidence();
    assert.equal(evidence.feature_quality?.length, 3);
    assert.ok(evidence.feature_quality?.includes('Loading state verified'));
    assert.ok(evidence.feature_quality?.includes('Error state verified'));
    assert.ok(
      evidence.feature_quality?.includes('Empty state pattern detected')
    );
  });

  it('getFinal reports the latest isolated reason for each category', () => {
    const acc = new EvidenceAccumulator();

    acc.addReason('contract_metadata', 'Required fields need verification');
    acc.addReason('feature_quality', 'All UX states explicitly verified');
    acc.addReason('contract_metadata', 'plugin.json has all required fields');

    const summary = acc.getFinal();
    assert.deepEqual(summary.reasons, {
      contract_metadata: 'plugin.json has all required fields',
      feature_quality: 'All UX states explicitly verified',
    });
  });

  it('getNextActions preserves insertion order while removing duplicates', () => {
    const acc = new EvidenceAccumulator();

    acc.addNextAction('Add unit tests');
    acc.addNextAction('Add unit tests');
    acc.addNextAction('Add integration tests');

    assert.deepEqual(acc.getNextActions(), [
      'Add unit tests',
      'Add integration tests',
    ]);
  });

  it('getFinal reports per-category scores and their total', () => {
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

    assert.deepEqual(summary.categoryScores, {
      contract_metadata: 18,
      runtime_integration: 20,
      feature_quality: 20,
      test_coverage: 15,
      operability_docs: 12,
    });
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
