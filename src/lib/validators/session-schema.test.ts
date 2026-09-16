import assert from 'node:assert/strict';
import test from 'node:test';
import type { JudoSession } from '../types';
import { sessionFieldsSchema, type SessionFields } from './session-schema';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

const durationTypeMatchesJudoSession: Equal<
  SessionFields['duration'],
  Omit<JudoSession, 'id'>['duration']
> = true;

const validSession = {
  date: '2026-03-18',
  effort: 3,
  category: 'Technical',
  techniques: ['Uchi mata'],
};

function firstIssueMessage(overrides: Record<string, unknown>): string {
  const result = sessionFieldsSchema.safeParse({
    ...validSession,
    ...overrides,
  });

  assert.equal(result.success, false);
  return result.error.issues[0]?.message ?? '';
}

test('session schema reports the route-compatible message for wrong effort types', () => {
  assert.equal(
    firstIssueMessage({ effort: '3' }),
    'Invalid effort level (must be an integer 1-5)'
  );
});

test('session schema reports the route-compatible message for wrong duration types', () => {
  assert.equal(durationTypeMatchesJudoSession, true);
  assert.equal(
    firstIssueMessage({ duration: '90' }),
    'Invalid duration: expected a non-negative integer'
  );
});

test('session schema accepts an omitted duration', () => {
  const result = sessionFieldsSchema.parse(validSession);

  assert.equal(result.duration, undefined);
});

test('session schema accepts a valid non-negative integer duration', () => {
  const result = sessionFieldsSchema.parse({ ...validSession, duration: 90 });

  assert.equal(result.duration, 90);
});

test('session schema rejects negative durations with the route-compatible message', () => {
  assert.equal(
    firstIssueMessage({ duration: -1 }),
    'Invalid duration: expected a non-negative integer'
  );
});

test('session schema rejects fractional durations with the route-compatible message', () => {
  assert.equal(
    firstIssueMessage({ duration: 1.5 }),
    'Invalid duration: expected a non-negative integer'
  );
});

test('session schema reports the route-compatible message for invalid categories', () => {
  assert.equal(firstIssueMessage({ category: 'Open Mat' }), 'Invalid category');
});
