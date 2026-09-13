import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionFieldsSchema } from './session-schema';

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
  assert.equal(
    firstIssueMessage({ duration: '90' }),
    'Invalid duration: expected a non-negative integer'
  );
});

test('session schema reports the route-compatible message for invalid categories', () => {
  assert.equal(firstIssueMessage({ category: 'Open Mat' }), 'Invalid category');
});
