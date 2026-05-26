import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PluginManifest } from '@/lib/plugins/types';

import { scoreTestCoverage } from './test-coverage-scoring';

const createManifest = (): PluginManifest => ({
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  description: 'Manifest fixture for test coverage scoring tests.',
  enabled: true,
  uiExtensions: [],
});

describe('scoreTestCoverage', () => {
  it('returns full explicit-evidence score with exact result fields', async () => {
    const result = await scoreTestCoverage({
      testEvidenceFiles: ['src/lib/plugins/foo.test.ts'],
      testEvidenceSource: 'explicit',
      missingExplicitTestFiles: [],
      manifest: createManifest(),
      pluginId: 'test-plugin',
    });

    assert.deepEqual(result, {
      score: 16,
      evidence: [
        'Found automated test evidence in 1 file(s).',
        'Manifest explicitly maps plugin maturity checks to test evidence files.',
      ],
      reasons: [],
      nextActions: [],
      blockers: [],
    });
  });

  it('returns heuristic-evidence score without explicit-evidence bonus', async () => {
    const result = await scoreTestCoverage({
      testEvidenceFiles: ['src/lib/plugins/foo.spec.ts', 'src/lib/plugins/bar.test.ts'],
      testEvidenceSource: 'heuristic',
      missingExplicitTestFiles: [],
      manifest: createManifest(),
      pluginId: 'test-plugin',
    });

    assert.deepEqual(result, {
      score: 12,
      evidence: ['Found automated test evidence in 2 file(s).'],
      reasons: [],
      nextActions: [],
      blockers: [],
    });
  });

  it('returns missing-files guidance when no test evidence is found', async () => {
    const result = await scoreTestCoverage({
      testEvidenceFiles: [],
      testEvidenceSource: 'none',
      missingExplicitTestFiles: ['src/lib/plugins/missing.test.ts'],
      manifest: createManifest(),
      pluginId: 'test-plugin',
    });

    assert.deepEqual(result, {
      score: 0,
      evidence: [],
      reasons: [
        'No plugin-specific automated test evidence was found.',
        'Some explicit maturity evidence test files declared in manifest could not be found.',
      ],
      nextActions: [
        'Add plugin-specific tests for manifest, runtime wiring, and primary feature behavior.',
        'Update `maturity.evidence.testFiles` so every declared path exists in the repo.',
      ],
      blockers: [],
    });
  });

  it('keeps clamp target and overflow context coherent for high-signal inputs', async () => {
    const result = await scoreTestCoverage({
      testEvidenceFiles: [
        'src/lib/plugins/foo.test.ts',
        'src/lib/plugins/bar.test.ts',
        'src/lib/plugins/baz.test.ts',
        'src/lib/plugins/qux.test.ts',
      ],
      testEvidenceSource: 'explicit',
      missingExplicitTestFiles: [
        'src/lib/plugins/missing-one.test.ts',
        'src/lib/plugins/missing-two.test.ts',
      ],
      manifest: createManifest(),
      pluginId: 'test-plugin',
    });

    // This fixture intentionally packs in multiple positive signals and missing-file
    // penalties so the clamp path can be asserted without duplicating the full-score
    // explicit-evidence fixture.
    assert.equal(result.score, 16);
    assert.deepEqual(result.evidence, [
      'Found automated test evidence in 4 file(s).',
      'Manifest explicitly maps plugin maturity checks to test evidence files.',
    ]);
    assert.deepEqual(result.reasons, [
      'Some explicit maturity evidence test files declared in manifest could not be found.',
    ]);
    assert.ok(result.score <= 20);
  });
});
