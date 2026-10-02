import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_AUDIT_CONFIG, type JudoSession } from '@/lib/types';
import type { SessionAssessment } from '@/lib/jev-client';
import {
  AUDIT_ASSESSMENT_CONCURRENCY,
  runSessionAudit,
} from './run-session-audit';

function makeSession(overrides: Partial<JudoSession> = {}): JudoSession {
  return {
    id: 'session-1',
    date: '2026-09-20',
    description: 'Worked on uchi-mata entries.',
    notes: 'Timing improved.',
    techniques: ['Uchi-mata'],
    effort: 3,
    category: 'Technical',
    ...overrides,
  };
}

function makeAssessment(
  overrides: Partial<SessionAssessment> = {}
): SessionAssessment {
  return {
    suggestedCategory: 'Randori',
    categoryConfidence: 0.92,
    categoryFitProbability: 0.94,
    hasUsefulDetail: 0.2,
    hasReflection: 0.2,
    effortConflictProbability: 0.9,
    unsupportedTechniqueTags: ['O-uchi-gari'],
    ...overrides,
  };
}

test('one assessment per described session can produce several semantic flags together', async () => {
  let calls = 0;
  const result = await runSessionAudit(
    [makeSession({ effort: 5, techniques: [] })],
    DEFAULT_AUDIT_CONFIG,
    async (input) => {
      calls += 1;
      assert.deepEqual(input, {
        description: 'Worked on uchi-mata entries.',
        notes: 'Timing improved.',
        category: 'Technical',
        effort: 5,
        techniques: [],
      });
      return makeAssessment();
    }
  );

  assert.equal(calls, 1);
  assert.ok(
    result.sessions[0].flags.some(
      (flag) => flag.code === 'no_techniques_high_effort'
    )
  );
  assert.deepEqual(
    result.sessions[0].flags
      .filter((flag) => flag.code !== 'no_techniques_high_effort')
      .map((flag) => flag.code),
    [
      'category_mismatch',
      'unsupported_technique_tags',
      'effort_conflict',
      'low_information',
      'missing_reflection',
    ]
  );
  assert.deepEqual(result.semanticAudit, {
    status: 'complete',
    assessedSessions: 1,
    failedSessions: 0,
  });
});

test('deterministic audit is available without an assessment request', async () => {
  const result = await runSessionAudit(
    [makeSession({ effort: 5, techniques: [], description: '' })],
    DEFAULT_AUDIT_CONFIG
  );

  assert.deepEqual(
    result.sessions[0].flags.map((flag) => flag.code),
    ['no_techniques_high_effort', 'empty_description']
  );
  assert.deepEqual(result.semanticAudit, {
    status: 'unavailable',
    assessedSessions: 0,
    failedSessions: 0,
  });
});

test('deterministic flags remain when one semantic assessment fails and later sessions continue', async () => {
  let calls = 0;
  const result = await runSessionAudit(
    [
      makeSession({ id: 'failed', effort: 5, techniques: [] }),
      makeSession({ id: 'successful' }),
    ],
    DEFAULT_AUDIT_CONFIG,
    async () => {
      calls += 1;
      if (calls === 1) throw new Error('redacted failure');
      return makeAssessment({
        suggestedCategory: 'Technical',
        unsupportedTechniqueTags: [],
        effortConflictProbability: 0.1,
        hasUsefulDetail: 0.9,
        hasReflection: 0.9,
      });
    }
  );

  assert.equal(calls, 2);
  assert.equal(result.sessions[0].sessionId, 'failed');
  assert.ok(
    result.sessions[0].flags.some(
      (flag) => flag.code === 'no_techniques_high_effort'
    )
  );
  assert.deepEqual(result.semanticAudit, {
    status: 'partial',
    assessedSessions: 1,
    failedSessions: 1,
  });
});

test('session assessments use a small fixed concurrency bound and preserve source ordering', async () => {
  let active = 0;
  let maximumActive = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sessions = Array.from({ length: 8 }, (_, index) =>
    makeSession({
      id: `session-${index}`,
      date: `2026-09-${index + 10}`,
      description: `Session ${index}`,
    })
  );

  const run = runSessionAudit(sessions, DEFAULT_AUDIT_CONFIG, async (input) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await gate;
    active -= 1;
    return makeAssessment({
      suggestedCategory: input.description.endsWith('0') ? 'Randori' : 'Shiai',
      unsupportedTechniqueTags: [],
      effortConflictProbability: 0.1,
      hasUsefulDetail: 0.9,
      hasReflection: 0.9,
    });
  });

  assert.equal(active, AUDIT_ASSESSMENT_CONCURRENCY);
  release();
  const result = await run;

  assert.equal(maximumActive, AUDIT_ASSESSMENT_CONCURRENCY);
  assert.deepEqual(
    result.semanticAudit,
    { status: 'complete', assessedSessions: sessions.length, failedSessions: 0 }
  );
  assert.deepEqual(
    result.sessions.map((session) => session.sessionId),
    sessions.map((session) => session.id)
  );
  assert.equal(result.sessions[0].flags[0].message.includes('Randori'), true);
  assert.equal(result.sessions[1].flags[0].message.includes('Shiai'), true);
});

test('concurrent assessment workers report exact success and failure totals', async () => {
  const sessions = Array.from({ length: 9 }, (_, index) =>
    makeSession({
      id: `session-${index}`,
      description: `Session ${index}`,
    })
  );

  const result = await runSessionAudit(
    sessions,
    DEFAULT_AUDIT_CONFIG,
    async (input) => {
      const index = Number(input.description.replace('Session ', ''));
      await new Promise((resolve) => setTimeout(resolve, index % 3));
      if (index % 2 === 0) throw new Error('redacted failure');
      return makeAssessment();
    }
  );

  assert.deepEqual(result.semanticAudit, {
    status: 'partial',
    assessedSessions: 4,
    failedSessions: 5,
  });
});

test('disabled semantic rules skip JEV and keep deterministic audit enabled', async () => {
  const config = {
    rules: DEFAULT_AUDIT_CONFIG.rules.map((rule) =>
      [
        'category_mismatch',
        'unsupported_technique_tags',
        'effort_conflict',
        'low_information',
        'missing_reflection',
      ].includes(rule.code)
        ? { ...rule, enabled: false }
        : { ...rule }
    ),
  };
  let called = false;
  const result = await runSessionAudit(
    [makeSession({ effort: 5, techniques: [] })],
    config,
    async () => {
      called = true;
      return makeAssessment();
    }
  );

  assert.equal(called, false);
  assert.ok(
    result.sessions[0].flags.some(
      (flag) => flag.code === 'no_techniques_high_effort'
    )
  );
  assert.equal(result.semanticAudit.status, 'disabled');
});
