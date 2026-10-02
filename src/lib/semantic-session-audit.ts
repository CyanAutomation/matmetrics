import type { SessionAssessment } from './jev-client';
import {
  shouldFlagEffortConflict,
  shouldOfferCategorySuggestion,
  shouldPromptForReflection,
  shouldPromptForUsefulDetail,
} from './jev-policy';
import {
  DEFAULT_AUDIT_CONFIG,
  SEMANTIC_AUDIT_FLAG_CODES,
  type AuditConfig,
  type AuditFlag,
  type AuditFlagCode,
  type JudoSession,
} from './types';

export function isSemanticAuditFlagCode(code: AuditFlagCode): boolean {
  return SEMANTIC_AUDIT_FLAG_CODES.some((semanticCode) => semanticCode === code);
}

function isRuleEnabled(config: AuditConfig, code: AuditFlagCode): boolean {
  return config.rules.some((rule) => rule.code === code && rule.enabled);
}

/** Convert a reusable session assessment into advisory, deterministic audit flags. */
export function semanticAssessmentToAuditFlags(
  session: JudoSession,
  assessment: SessionAssessment,
  config: AuditConfig = DEFAULT_AUDIT_CONFIG
): AuditFlag[] {
  const flags: AuditFlag[] = [];

  if (
    isRuleEnabled(config, 'category_mismatch') &&
    assessment.suggestedCategory !== session.category &&
    shouldOfferCategorySuggestion(
      assessment.categoryConfidence,
      assessment.categoryFitProbability
    )
  ) {
    flags.push({
      code: 'category_mismatch',
      severity: 'warning',
      message: `This session may fit ${assessment.suggestedCategory} better than ${session.category}.`,
    });
  }

  const unsupportedTechniques = Array.from(
    new Set(assessment.unsupportedTechniqueTags.map((tag) => tag.trim()))
  ).filter(Boolean);
  if (
    isRuleEnabled(config, 'unsupported_technique_tags') &&
    unsupportedTechniques.length > 0
  ) {
    const isSingle = unsupportedTechniques.length === 1;
    flags.push({
      code: 'unsupported_technique_tags',
      severity: 'warning',
      message: `The saved technique${isSingle ? '' : 's'} ${unsupportedTechniques.join(', ')} ${isSingle ? "isn't" : "aren't"} clearly supported by this entry.`,
    });
  }

  if (
    isRuleEnabled(config, 'effort_conflict') &&
    shouldFlagEffortConflict(
      assessment.effortConflictProbability ?? Number.NaN
    )
  ) {
    flags.push({
      code: 'effort_conflict',
      severity: 'warning',
      message:
        'The written description appears inconsistent with the selected effort.',
    });
  }

  if (
    isRuleEnabled(config, 'low_information') &&
    shouldPromptForUsefulDetail(assessment.hasUsefulDetail)
  ) {
    flags.push({
      code: 'low_information',
      severity: 'info',
      message:
        'This entry has little reusable training detail. Add a technique, drill or training focus to make it more useful later.',
    });
  }

  if (
    isRuleEnabled(config, 'missing_reflection') &&
    shouldPromptForReflection(assessment.hasReflection)
  ) {
    flags.push({
      code: 'missing_reflection',
      severity: 'info',
      message:
        'Consider recording what worked, what was difficult, or what you want to try next time.',
    });
  }

  return flags;
}
