import assert from 'node:assert/strict';
import test from 'node:test';

import type { SessionAssessment } from './jev-client';
import { semanticAssessmentToAuditFlags } from './semantic-session-audit';
import type { JudoSession } from './types';

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
    suggestedCategory: 'Technical',
    categoryConfidence: 0.9,
    categoryFitProbability: 0.9,
    hasUsefulDetail: 0.9,
    hasReflection: 0.9,
    unsupportedTechniqueTags: [],
    ...overrides,
  };
}

test('matching category and supported, detailed, reflective text produce no semantic flags', () => {
  assert.deepEqual(
    semanticAssessmentToAuditFlags(makeSession(), makeAssessment()),
    []
  );
});

test('category mismatch is suppressed below either central confidence threshold', () => {
  const session = makeSession();
  const mismatch = makeAssessment({ suggestedCategory: 'Randori' });

  assert.deepEqual(
    semanticAssessmentToAuditFlags(session, {
      ...mismatch,
      categoryConfidence: 0.79,
    }),
    []
  );
  assert.deepEqual(
    semanticAssessmentToAuditFlags(session, {
      ...mismatch,
      categoryFitProbability: 0.79,
    }),
    []
  );
});

test('confident category mismatch is an advisory warning', () => {
  const flags = semanticAssessmentToAuditFlags(
    makeSession(),
    makeAssessment({ suggestedCategory: 'Randori' })
  );

  assert.deepEqual(flags, [
    {
      code: 'category_mismatch',
      severity: 'warning',
      message: 'This session may fit Randori better than Technical.',
    },
  ]);
});

test('unsupported saved techniques are grouped into one advisory warning', () => {
  const flags = semanticAssessmentToAuditFlags(
    makeSession(),
    makeAssessment({
      unsupportedTechniqueTags: ['O-uchi-gari', 'Uchi-mata', 'O-uchi-gari'],
    })
  );

  assert.equal(flags.length, 1);
  assert.deepEqual(flags[0], {
    code: 'unsupported_technique_tags',
    severity: 'warning',
    message:
      "The saved techniques O-uchi-gari, Uchi-mata aren't clearly supported by this entry.",
  });
});

test('one unsupported saved technique uses singular wording', () => {
  const flags = semanticAssessmentToAuditFlags(
    makeSession(),
    makeAssessment({ unsupportedTechniqueTags: ['O-uchi-gari'] })
  );

  assert.match(flags[0].message, /O-uchi-gari isn't clearly supported/);
});

test('effort, useful-detail, and reflection findings use existing policy cutoffs', () => {
  const flags = semanticAssessmentToAuditFlags(
    makeSession(),
    makeAssessment({
      effortConflictProbability: 0.8,
      hasUsefulDetail: 0.49,
      hasReflection: 0.49,
    })
  );

  assert.deepEqual(
    flags.map(({ code, severity }) => [code, severity]),
    [
      ['effort_conflict', 'warning'],
      ['low_information', 'info'],
      ['missing_reflection', 'info'],
    ]
  );
});

test('semantic flags respect disabled rules in custom audit configuration', () => {
  const config = {
    rules: [
      { code: 'category_mismatch' as const, enabled: false },
      { code: 'unsupported_technique_tags' as const, enabled: false },
      { code: 'effort_conflict' as const, enabled: false },
      { code: 'low_information' as const, enabled: false },
      { code: 'missing_reflection' as const, enabled: false },
    ],
  };
  const assessment = makeAssessment({
    suggestedCategory: 'Randori',
    unsupportedTechniqueTags: ['O-uchi-gari'],
    effortConflictProbability: 0.9,
    hasUsefulDetail: 0.1,
    hasReflection: 0.1,
  });

  assert.deepEqual(
    semanticAssessmentToAuditFlags(makeSession(), assessment, config),
    []
  );
});
