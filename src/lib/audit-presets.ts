import type {
  AuditConfig,
  AuditFlagCode,
  AuditMode,
  AuditRuleConfig,
} from './types';
import {
  DEFAULT_AUDIT_CONFIG,
  SEMANTIC_AUDIT_FLAG_CODES,
  STRICT_AUDIT_CONFIG,
} from './types';

const RULE_ORDER: AuditFlagCode[] = [
  'no_techniques_high_effort',
  'empty_description',
  'empty_notes',
  'duration_outlier',
  ...SEMANTIC_AUDIT_FLAG_CODES,
];

export type AuditStrictnessPreset = 'gentle' | 'balanced' | 'thorough';

const GENTLE_AUDIT_CONFIG: AuditConfig = {
  rules: [
    {
      code: 'no_techniques_high_effort',
      enabled: true,
      effortThreshold: 5,
    },
    {
      code: 'empty_description',
      enabled: true,
    },
    {
      code: 'empty_notes',
      enabled: false,
    },
    {
      code: 'duration_outlier',
      enabled: true,
      durationStdDevMultiplier: 2.5,
    },
    {
      code: 'category_mismatch',
      enabled: true,
    },
    {
      code: 'unsupported_technique_tags',
      enabled: true,
    },
    {
      code: 'effort_conflict',
      enabled: true,
    },
    {
      code: 'low_information',
      enabled: true,
    },
    {
      code: 'missing_reflection',
      enabled: true,
    },
  ],
};

const PRESET_CONFIGS: Record<AuditStrictnessPreset, AuditConfig> = {
  gentle: GENTLE_AUDIT_CONFIG,
  balanced: DEFAULT_AUDIT_CONFIG,
  thorough: STRICT_AUDIT_CONFIG,
};

const PRESET_MODES: Record<AuditStrictnessPreset, AuditMode> = {
  gentle: 'custom',
  balanced: 'standard',
  thorough: 'strict',
};

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

export function getAuditConfigPresetByStrictness(
  preset: AuditStrictnessPreset
): AuditConfig {
  return {
    rules: cloneRules(PRESET_CONFIGS[preset].rules),
  };
}

export function getAuditModeForStrictnessPreset(
  preset: AuditStrictnessPreset
): AuditMode {
  return PRESET_MODES[preset];
}

export function inferStrictnessPresetFromAudit(
  mode: AuditMode,
  config: AuditConfig
): AuditStrictnessPreset | null {
  const normalized = normalizeAuditConfigShape(config);

  if (
    mode === 'standard' ||
    areAuditConfigsEqual(normalized, PRESET_CONFIGS.balanced)
  ) {
    return 'balanced';
  }

  if (
    mode === 'strict' ||
    areAuditConfigsEqual(normalized, PRESET_CONFIGS.thorough)
  ) {
    return 'thorough';
  }

  if (areAuditConfigsEqual(normalized, PRESET_CONFIGS.gentle)) {
    return 'gentle';
  }

  return null;
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
