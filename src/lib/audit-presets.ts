import type {
  AuditConfig,
  AuditFlagCode,
  AuditMode,
  AuditRuleConfig,
} from './types';
import { DEFAULT_AUDIT_CONFIG, STRICT_AUDIT_CONFIG } from './types';

const RULE_ORDER: AuditFlagCode[] = [
  'no_techniques_high_effort',
  'empty_description',
  'empty_notes',
  'duration_outlier',
];

function cloneRules(rules: AuditRuleConfig[]): AuditRuleConfig[] {
  return rules.map((rule) => ({ ...rule }));
}

function normalizeRuleByCode(
  rules: AuditRuleConfig[]
): Map<AuditFlagCode, AuditRuleConfig> {
  const ruleByCode = new Map<AuditFlagCode, AuditRuleConfig>();
  for (const rule of rules) {
    ruleByCode.set(rule.code, { ...rule });
  }
  return ruleByCode;
}

export function getAuditConfigPreset(
  mode: Exclude<AuditMode, 'custom'>
): AuditConfig {
  return {
    rules: cloneRules(
      mode === 'strict' ? STRICT_AUDIT_CONFIG.rules : DEFAULT_AUDIT_CONFIG.rules
    ),
  };
}

export function normalizeAuditConfigShape(config: AuditConfig): AuditConfig {
  const fallbackRulesByCode = normalizeRuleByCode(DEFAULT_AUDIT_CONFIG.rules);
  const inputRulesByCode = normalizeRuleByCode(config.rules);

  return {
    rules: RULE_ORDER.map((code) => {
      const fallback = fallbackRulesByCode.get(code);
      const input = inputRulesByCode.get(code);
      if (!fallback) {
        return input || { code, enabled: true };
      }
      return {
        ...fallback,
        ...input,
        code,
      };
    }),
  };
}

export function areAuditConfigsEqual(
  left: AuditConfig,
  right: AuditConfig
): boolean {
  return (
    JSON.stringify(normalizeAuditConfigShape(left)) ===
    JSON.stringify(normalizeAuditConfigShape(right))
  );
}

export function inferAuditModeFromConfig(config: AuditConfig): AuditMode {
  if (areAuditConfigsEqual(config, DEFAULT_AUDIT_CONFIG)) {
    return 'standard';
  }
  if (areAuditConfigsEqual(config, STRICT_AUDIT_CONFIG)) {
    return 'strict';
  }
  return 'custom';
}
