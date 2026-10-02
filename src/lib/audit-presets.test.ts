import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAuditConfigPresetByStrictness,
  normalizeAuditConfigShape,
} from './audit-presets';
import {
  DEFAULT_AUDIT_CONFIG,
  SEMANTIC_AUDIT_FLAG_CODES,
  type AuditConfig,
} from './types';

test('semantic checks participate in every built-in audit preset', () => {
  for (const preset of ['gentle', 'balanced', 'thorough'] as const) {
    const config = getAuditConfigPresetByStrictness(preset);
    for (const code of SEMANTIC_AUDIT_FLAG_CODES) {
      assert.equal(
        config.rules.find((rule) => rule.code === code)?.enabled,
        true,
        `${preset} should enable ${code}`
      );
    }
  }
});

test('older custom configurations receive the new semantic rules with defaults', () => {
  const oldConfig: AuditConfig = {
    rules: DEFAULT_AUDIT_CONFIG.rules
      .filter(
        (rule) =>
          !SEMANTIC_AUDIT_FLAG_CODES.some((code) => code === rule.code)
      )
      .map((rule) => ({ ...rule, enabled: false })),
  };
  const normalized = normalizeAuditConfigShape(oldConfig);

  for (const code of SEMANTIC_AUDIT_FLAG_CODES) {
    assert.equal(
      normalized.rules.find((rule) => rule.code === code)?.enabled,
      true
    );
  }
  assert.equal(
    normalized.rules.find((rule) => rule.code === 'empty_description')?.enabled,
    false
  );
});
