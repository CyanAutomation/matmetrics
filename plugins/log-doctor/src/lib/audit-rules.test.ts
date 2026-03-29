import assert from 'node:assert/strict';
import test from 'node:test';

import type { JudoSession, AuditRuleConfig } from '@/lib/types';
import {
  detectNoTechniquesHighEffort,
  detectEmptyDescription,
  detectEmptyNotes,
  detectDurationOutlier,
  runAuditRules,
  runAuditRulesForAllSessions,
} from './audit-rules';

// Helper to create test sessions
function makeSession(overrides?: Partial<JudoSession>): JudoSession {
  const data = new Date('2026-03-18');
  return {
    id: `session-${Math.random().toString(36).slice(2)}`,
    date: '2026-03-18',
    techniques: ['Uchi mata'],
    effort: 3,
    category: 'Technical',
    description: 'Focused on uchi mata entries',
    notes: 'Good form on grip',
    duration: 90,
    ...overrides,
  };
}

test('detectNoTechniquesHighEffort: flags high effort (>= 4) with zero techniques', () => {
  const session = makeSession({
    effort: 4,
    techniques: [],
  });
  const config: AuditRuleConfig = {
    code: 'no_techniques_high_effort',
    enabled: true,
    effortThreshold: 4,
  };

  const flag = detectNoTechniquesHighEffort(session, config);

  assert(flag !== null);
  assert.equal(flag?.code, 'no_techniques_high_effort');
  assert.equal(flag?.severity, 'error');
  assert(flag?.message);
});

test('detectNoTechniquesHighEffort: flags effort 5 with zero techniques', () => {
  const session = makeSession({
    effort: 5,
    techniques: [],
  });
  const config: AuditRuleConfig = {
    code: 'no_techniques_high_effort',
    enabled: true,
    effortThreshold: 4,
  };

  const flag = detectNoTechniquesHighEffort(session, config);

  assert(flag !== null);
});

test('detectNoTechniquesHighEffort: does not flag effort 3 with zero techniques', () => {
  const session = makeSession({
    effort: 3,
    techniques: [],
  });
  const config: AuditRuleConfig = {
    code: 'no_techniques_high_effort',
    enabled: true,
    effortThreshold: 4,
  };

  const flag = detectNoTechniquesHighEffort(session, config);

  assert.equal(flag, null);
});

test('detectNoTechniquesHighEffort: does not flag effort 5 with techniques', () => {
  const session = makeSession({
    effort: 5,
    techniques: ['Uchi mata', 'Seoi nage'],
  });
  const config: AuditRuleConfig = {
    code: 'no_techniques_high_effort',
    enabled: true,
    effortThreshold: 4,
  };

  const flag = detectNoTechniquesHighEffort(session, config);

  assert.equal(flag, null);
});

test('detectNoTechniquesHighEffort: respects custom effort threshold', () => {
  const session = makeSession({
    effort: 3,
    techniques: [],
  });
  const config: AuditRuleConfig = {
    code: 'no_techniques_high_effort',
    enabled: true,
    effortThreshold: 3,
  };

  const flag = detectNoTechniquesHighEffort(session, config);

  assert(flag !== null);
});

test('detectEmptyDescription: flags missing description', () => {
  const session = makeSession({
    description: undefined,
  });

  const flag = detectEmptyDescription(session);

  assert(flag !== null);
  assert.equal(flag?.code, 'empty_description');
  assert.equal(flag?.severity, 'warning');
});

test('detectEmptyDescription: flags empty string description', () => {
  const session = makeSession({
    description: '',
  });

  const flag = detectEmptyDescription(session);

  assert(flag !== null);
});

test('detectEmptyDescription: flags whitespace-only description', () => {
  const session = makeSession({
    description: '   ',
  });

  const flag = detectEmptyDescription(session);

  assert(flag !== null);
});

test('detectEmptyDescription: does not flag non-empty description', () => {
  const session = makeSession({
    description: 'Focused on footwork',
  });

  const flag = detectEmptyDescription(session);

  assert.equal(flag, null);
});

test('detectEmptyNotes: flags missing notes', () => {
  const session = makeSession({
    notes: undefined,
  });

  const flag = detectEmptyNotes(session);

  assert(flag !== null);
  assert.equal(flag?.code, 'empty_notes');
  assert.equal(flag?.severity, 'warning');
});

test('detectEmptyNotes: flags empty notes', () => {
  const session = makeSession({
    notes: '',
  });

  const flag = detectEmptyNotes(session);

  assert(flag !== null);
});

test('detectEmptyNotes: flags whitespace-only notes', () => {
  const session = makeSession({
    notes: '\n\t ',
  });

  const flag = detectEmptyNotes(session);

  assert(flag !== null);
});

test('detectEmptyNotes: does not flag non-empty notes', () => {
  const session = makeSession({
    notes: 'Need to work on grip',
  });

  const flag = detectEmptyNotes(session);

  assert.equal(flag, null);
});

test('detectDurationOutlier: does not flag when duration is undefined', () => {
  const session = makeSession({
    duration: undefined,
  });
  const allSessions = [session];
  const config: AuditRuleConfig = {
    code: 'duration_outlier',
    enabled: true,
    durationStdDevMultiplier: 2,
  };

  const flag = detectDurationOutlier(session, allSessions, config);

  assert.equal(flag, null);
});

test('detectDurationOutlier: does not flag when less than 3 sessions with duration', () => {
  const session1 = makeSession({ duration: 90 });
  const session2 = makeSession({ duration: 100 });
  const config: AuditRuleConfig = {
    code: 'duration_outlier',
    enabled: true,
    durationStdDevMultiplier: 2,
  };

  const flag = detectDurationOutlier(session1, [session1, session2], config);

  assert.equal(flag, null);
});

test('detectDurationOutlier: flags large duration outliers with 1 std dev multiplier', () => {
  // Use baseline of 90-100, test with multiplier=1 to make outlier detection easier
  const sessions: JudoSession[] = [
    makeSession({ duration: 100 }),
    makeSession({ duration: 102 }),
    makeSession({ duration: 98 }),
    makeSession({ duration: 99 }),
    makeSession({ duration: 500 }), // clear outlier
  ];
  const config: AuditRuleConfig = {
    code: 'duration_outlier',
    enabled: true,
    durationStdDevMultiplier: 1, // relaxed threshold
  };

  const flag = detectDurationOutlier(sessions[4], sessions, config);

  assert(flag !== null);
  assert.equal(flag?.code, 'duration_outlier');
  assert.equal(flag?.severity, 'info');
});

test('detectDurationOutlier: flags small duration outliers with 1 std dev multiplier', () => {
  // Use baseline of 90-100, test with multiplier=1 to make outlier detection easier
  const sessions: JudoSession[] = [
    makeSession({ duration: 100 }),
    makeSession({ duration: 102 }),
    makeSession({ duration: 98 }),
    makeSession({ duration: 99 }),
    makeSession({ duration: 1 }), // clear outlier below
  ];
  const config: AuditRuleConfig = {
    code: 'duration_outlier',
    enabled: true,
    durationStdDevMultiplier: 1, // relaxed threshold
  };

  const flag = detectDurationOutlier(sessions[4], sessions, config);

  assert(flag !== null);
});

test('detectDurationOutlier: does not flag duration within 2 std deviations', () => {
  const sessions: JudoSession[] = [
    makeSession({ duration: 90 }),
    makeSession({ duration: 100 }),
    makeSession({ duration: 110 }),
    makeSession({ duration: 95 }), // within 2 std dev
  ];
  const config: AuditRuleConfig = {
    code: 'duration_outlier',
    enabled: true,
    durationStdDevMultiplier: 2,
  };

  const flag = detectDurationOutlier(sessions[3], sessions, config);

  assert.equal(flag, null);
});

test('detectDurationOutlier: respects custom std dev multiplier', () => {
  const sessions: JudoSession[] = [
    makeSession({ duration: 90 }),
    makeSession({ duration: 100 }),
    makeSession({ duration: 110 }),
    makeSession({ duration: 130 }), // outlier at 1 std dev multiplier
  ];
  const config: AuditRuleConfig = {
    code: 'duration_outlier',
    enabled: true,
    durationStdDevMultiplier: 1,
  };

  const flag = detectDurationOutlier(sessions[3], sessions, config);

  assert(flag !== null);
});

test('runAuditRules: runs all enabled rules', () => {
  const session = makeSession({
    effort: 5,
    techniques: [],
    description: '',
    notes: '',
  });
  const allSessions = [
    session,
    makeSession({ duration: 90 }),
    makeSession({ duration: 100 }),
    makeSession({ duration: 110 }),
  ];

  const flags = runAuditRules(session, allSessions);

  const codes = flags.map((f) => f.code);
  assert(codes.includes('no_techniques_high_effort'));
  assert(codes.includes('empty_description'));
  assert(codes.includes('empty_notes'));
});

test('runAuditRules: skips disabled rules', () => {
  const session = makeSession({
    effort: 5,
    techniques: [],
    description: '', // override to trigger empty_description flag
    notes: '', // override to trigger empty_notes flag
  });
  const allSessions = [session];

  const config = {
    rules: [
      {
        code: 'no_techniques_high_effort' as const,
        enabled: false,
        effortThreshold: 4,
      },
      {
        code: 'empty_description' as const,
        enabled: true,
      },
      {
        code: 'empty_notes' as const,
        enabled: true,
      },
      {
        code: 'duration_outlier' as const,
        enabled: true,
      },
    ],
  };

  const flags = runAuditRules(session, allSessions, config);

  const codes = flags.map((f) => f.code);
  assert(!codes.includes('no_techniques_high_effort'));
  assert(codes.includes('empty_description'));
});

test('runAuditRules: returns empty array for clean session', () => {
  const session = makeSession({
    effort: 2,
    techniques: ['Seoi nage'],
    description: 'Good session',
    notes: 'Form was good',
    duration: 90,
  });
  const allSessions = [
    session,
    makeSession({ duration: 85 }),
    makeSession({ duration: 95 }),
  ];

  const flags = runAuditRules(session, allSessions);

  assert.equal(flags.length, 0);
});

test('runAuditRulesForAllSessions: returns flagged sessions only', () => {
  const sessions = [
    makeSession({ id: '1', effort: 5, techniques: [] }), // flagged
    makeSession({ id: '2' }), // clean
    makeSession({ id: '3', description: '' }), // flagged
  ];

  const results = runAuditRulesForAllSessions(sessions);

  assert.equal(results.length, 2);
  assert.equal(results[0].sessionId, '1');
  assert.equal(results[1].sessionId, '3');
});

test('runAuditRulesForAllSessions: includes sessions with no flags in original list', () => {
  const sessions = [
    makeSession({ id: '1' }),
    makeSession({ id: '2' }),
  ];

  const results = runAuditRulesForAllSessions(sessions);

  assert.equal(results.length, 0);
});
