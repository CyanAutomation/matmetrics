/**
 * Audit rules: Data quality checks for Judo session logs
 */

import {
  type AuditConfig,
  type AuditFlag,
  type AuditRuleConfig,
  type JudoSession,
  DEFAULT_AUDIT_CONFIG,
} from '@/lib/types';

/**
 * Check if a session has no techniques but high effort level
 * Flags when effort >= threshold (default 4) and techniques array is empty
 */
export function detectNoTechniquesHighEffort(
  session: JudoSession,
  config: AuditRuleConfig
): AuditFlag | null {
  const threshold = config.effortThreshold ?? 4;

  if (session.effort >= threshold && session.techniques.length === 0) {
    return {
      code: 'no_techniques_high_effort',
      severity: 'error',
      message: `High intensity session (effort ${session.effort}) with no techniques logged. Verify if this was a conditioning or recovery session.`,
    };
  }

  return null;
}

/**
 * Check if session has empty or missing description
 */
export function detectEmptyDescription(session: JudoSession): AuditFlag | null {
  if (!session.description || session.description.trim().length === 0) {
    return {
      code: 'empty_description',
      severity: 'warning',
      message: 'Session has no description. Add a summary of what was covered.',
    };
  }

  return null;
}

/**
 * Check if session has empty or missing notes
 */
export function detectEmptyNotes(session: JudoSession): AuditFlag | null {
  if (!session.notes || session.notes.trim().length === 0) {
    return {
      code: 'empty_notes',
      severity: 'warning',
      message:
        'Session has no notes. Consider adding observations or focus areas.',
    };
  }

  return null;
}

/**
 * Check if session duration is a statistical outlier
 * Flags if duration is beyond (mean ± multiplier * stddev)
 */
export function detectDurationOutlier(
  session: JudoSession,
  allSessions: JudoSession[],
  config: AuditRuleConfig
): AuditFlag | null {
  if (!session.duration) {
    return null;
  }

  // Collect durations from all sessions that have duration set
  const durations = allSessions
    .map((s) => s.duration)
    .filter((d): d is number => d !== undefined && d > 0);

  if (durations.length < 3) {
    // Need at least 3 data points for meaningful outlier detection
    return null;
  }

  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance =
    durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) /
    durations.length;
  const stdDev = Math.sqrt(variance);

  const multiplier = config.durationStdDevMultiplier ?? 2;
  const lowerBound = mean - multiplier * stdDev;
  const upperBound = mean + multiplier * stdDev;

  if (session.duration < lowerBound || session.duration > upperBound) {
    return {
      code: 'duration_outlier',
      severity: 'info',
      message: `Session duration ${session.duration}m is unusual (typical: ${Math.round(mean)}m ±${Math.round(multiplier * stdDev)}m). Verify if this is expected.`,
    };
  }

  return null;
}

/**
 * Run all enabled audit rules for a session
 * Returns array of flags for rules that detected issues
 * By default uses DEFAULT_AUDIT_CONFIG; pass config to customize
 */
export function runAuditRules(
  session: JudoSession,
  allSessions: JudoSession[],
  config?: AuditConfig
): AuditFlag[] {
  const auditConfig = config || DEFAULT_AUDIT_CONFIG;
  const flags: AuditFlag[] = [];

  // Map of rule code to detection function
  const ruleDetectors: Record<
    string,
    (session: JudoSession, config: AuditRuleConfig) => AuditFlag | null
  > = {
    no_techniques_high_effort: (session, config) =>
      detectNoTechniquesHighEffort(session, config),
    empty_description: (session, config) => {
      void config;
      return detectEmptyDescription(session);
    },
    empty_notes: (session, config) => {
      void config;
      return detectEmptyNotes(session);
    },
    duration_outlier: (session, config) =>
      detectDurationOutlier(session, allSessions, config),
  };

  // Run each enabled rule
  for (const rule of auditConfig.rules) {
    if (!rule.enabled) {
      continue;
    }

    const detector = ruleDetectors[rule.code];
    if (!detector) {
      console.warn(`Unknown audit rule: ${rule.code}`);
      continue;
    }

    const flag = detector(session, rule);
    if (flag) {
      flags.push(flag);
    }
  }

  return flags;
}

/**
 * Run audit rules for all sessions and return flagged sessions
 */
export function runAuditRulesForAllSessions(
  sessions: JudoSession[],
  config?: AuditConfig
): Array<{
  sessionId: string;
  sessionDate: string;
  flags: AuditFlag[];
}> {
  return sessions
    .map((session) => ({
      sessionId: session.id,
      sessionDate: session.date,
      flags: runAuditRules(session, sessions, config),
    }))
    .filter((result) => result.flags.length > 0);
}
