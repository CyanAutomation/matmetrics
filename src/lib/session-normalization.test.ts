import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSessionList } from './session-normalization';

const validSession = {
  id: 'session-1',
  date: '2026-08-24',
  effort: 3,
  category: 'Technical',
  description: 'Drilling throws',
};

test('normalizes null techniques in persisted sessions to an empty array', () => {
  const sessions = normalizeSessionList([
    { ...validSession, techniques: null },
  ]);

  assert.deepEqual(sessions, [{ ...validSession, techniques: [] }]);
});

test('preserves persisted sessions with legacy IDs containing reserved characters', () => {
  const sessions = normalizeSessionList([
    { ...validSession, id: 'legacy/session?source=import', techniques: [] },
  ]);

  assert.deepEqual(sessions, [
    { ...validSession, id: 'legacy/session?source=import', techniques: [] },
  ]);
});

test('excludes persisted sessions with missing, blank, or oversized IDs', () => {
  const sessions = normalizeSessionList([
    { ...validSession, id: undefined, techniques: [] },
    { ...validSession, id: '  ', techniques: [] },
    { ...validSession, id: 'a'.repeat(101), techniques: [] },
  ]);

  assert.deepEqual(sessions, []);
});

test('excludes persisted sessions that do not satisfy the session contract', () => {
  const sessions = normalizeSessionList([
    { ...validSession, techniques: ['Uchi mata', 42] },
  ]);

  assert.deepEqual(sessions, []);
});
