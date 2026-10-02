import type {
  AuditConfig,
  AuditSessionResult,
  JudoSession,
  SemanticAuditRunSummary,
} from '@/lib/types';
import type {
  SessionAssessment,
  SessionAssessmentInput,
} from '@/lib/jev-client';
import {
  isSemanticAuditFlagCode,
  semanticAssessmentToAuditFlags,
} from '@/lib/semantic-session-audit';
import { runAuditRules } from './audit-rules';

/** Keep full-history runs practical without sending an unbounded request burst. */
export const AUDIT_ASSESSMENT_CONCURRENCY = 3;

export type AuditAssessmentRequest = (
  input: SessionAssessmentInput
) => Promise<SessionAssessment>;

export type SessionAuditRun = {
  sessions: AuditSessionResult[];
  semanticAudit: SemanticAuditRunSummary;
};

type IndexedAuditResult = AuditSessionResult & { sourceIndex: number };

function hasEnabledSemanticRule(config: AuditConfig): boolean {
  return config.rules.some(
    (rule) => rule.enabled && isSemanticAuditFlagCode(rule.code)
  );
}

function createAssessmentInput(session: JudoSession): SessionAssessmentInput {
  return {
    description: session.description?.trim() ?? '',
    notes: session.notes?.trim() || undefined,
    category: session.category,
    effort: session.effort,
    techniques: session.techniques.slice(0, 12),
  };
}

function createSemanticRunSummary(
  status: SemanticAuditRunSummary['status'],
  assessedSessions = 0,
  failedSessions = 0
): SemanticAuditRunSummary {
  return { status, assessedSessions, failedSessions };
}

/**
 * Runs exact audit rules for every session, then adds findings from one
 * combined semantic assessment per described session when available.
 */
export async function runSessionAudit(
  sessions: JudoSession[],
  config: AuditConfig,
  assess?: AuditAssessmentRequest
): Promise<SessionAuditRun> {
  const results: IndexedAuditResult[] = sessions.map(
    (session, sourceIndex) => ({
      sourceIndex,
      sessionId: session.id,
      sessionDate: session.date,
      flags: runAuditRules(session, sessions, config),
      ignoredRules: [],
    })
  );

  if (!hasEnabledSemanticRule(config)) {
    return {
      sessions: toFlaggedResults(results),
      semanticAudit: createSemanticRunSummary('disabled'),
    };
  }

  if (!assess) {
    return {
      sessions: toFlaggedResults(results),
      semanticAudit: createSemanticRunSummary('unavailable'),
    };
  }

  const candidates = sessions.flatMap((session, index) =>
    session.description?.trim() ? [{ session, index }] : []
  );
  if (candidates.length === 0) {
    return {
      sessions: toFlaggedResults(results),
      semanticAudit: createSemanticRunSummary('complete'),
    };
  }

  let nextCandidateIndex = 0;
  let assessedSessions = 0;
  let failedSessions = 0;
  const workerCount = Math.min(
    AUDIT_ASSESSMENT_CONCURRENCY,
    candidates.length
  );

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextCandidateIndex < candidates.length) {
      const candidate = candidates[nextCandidateIndex++];
      const result = results[candidate.index];
      try {
        const assessment = await assess(
          createAssessmentInput(candidate.session)
        );
        assessedSessions += 1;
        result.flags.push(
          ...semanticAssessmentToAuditFlags(
            candidate.session,
            assessment,
            config
          )
        );
      } catch {
        // Keep deterministic findings and continue assessing other sessions.
        failedSessions += 1;
      }
    }
  });

  await Promise.all(workers);

  const status: SemanticAuditRunSummary['status'] =
    failedSessions === 0
      ? 'complete'
      : assessedSessions === 0
        ? 'unavailable'
        : 'partial';

  return {
    sessions: toFlaggedResults(results),
    semanticAudit: createSemanticRunSummary(
      status,
      assessedSessions,
      failedSessions
    ),
  };
}

function toFlaggedResults(
  results: IndexedAuditResult[]
): AuditSessionResult[] {
  return results
    .filter((result) => result.flags.length > 0)
    .map(({ sessionId, sessionDate, flags, ignoredRules }) => ({
      sessionId,
      sessionDate,
      flags,
      ignoredRules,
    }));
}
