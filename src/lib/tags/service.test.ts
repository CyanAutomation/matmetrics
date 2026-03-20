import assert from 'node:assert/strict';
import test from 'node:test';
import { createTagService } from './service';
import type { JudoSession } from '../types';

function makeSession(id: string, techniques: string[]): JudoSession {
  return {
    id,
    date: '2026-03-20',
    effort: 3,
    category: 'Technical',
    techniques,
    description: 'Test',
    notes: 'Test notes',
    duration: 60,
  };
}

test('rename returns a case conflict when target casing already exists', async () => {
  const sessions = [makeSession('s1', ['armbar', 'Armbar'])];
  const updates: JudoSession[] = [];
  const service = createTagService({
    getSessions: () => sessions,
    updateSession: async (session) => {
      updates.push(session);
      return { status: 'synced' };
    },
  });

  const result = await service.renameTag('armbar', 'Armbar');

  assert.equal(result.affectedSessionCount, 0);
  assert.equal(result.changedTagCount, 0);
  assert.equal(result.conflicts[0]?.code, 'case_conflict');
  assert.equal(updates.length, 0);
});

test('rename to existing tag returns a conflict instead of mutating sessions', async () => {
  const sessions = [makeSession('s1', ['seoi-nage', 'uchi-mata'])];
  const updates: JudoSession[] = [];
  const service = createTagService({
    getSessions: () => sessions,
    updateSession: async (session) => {
      updates.push(session);
      return { status: 'synced' };
    },
  });

  const result = await service.renameTag('seoi-nage', 'uchi-mata');

  assert.equal(result.affectedSessionCount, 0);
  assert.equal(result.changedTagCount, 0);
  assert.equal(result.conflicts[0]?.code, 'target_tag_exists');
  assert.equal(updates.length, 0);
});

test('merge into same tag returns conflict and performs no updates', async () => {
  const sessions = [makeSession('s1', ['osoto-gari'])];
  const updates: JudoSession[] = [];
  const service = createTagService({
    getSessions: () => sessions,
    updateSession: async (session) => {
      updates.push(session);
      return { status: 'synced' };
    },
  });

  const result = await service.mergeTags('osoto-gari', 'osoto-gari');

  assert.equal(result.affectedSessionCount, 0);
  assert.equal(result.changedTagCount, 0);
  assert.equal(result.conflicts[0]?.code, 'merge_same_tag');
  assert.equal(updates.length, 0);
});

test('delete nonexistent tag returns conflict and supports dry-run', async () => {
  const sessions = [makeSession('s1', ['tomoe-nage'])];
  const updates: JudoSession[] = [];
  const service = createTagService({
    getSessions: () => sessions,
    updateSession: async (session) => {
      updates.push(session);
      return { status: 'synced' };
    },
  });

  const result = await service.deleteTag('harai-goshi', { dryRun: true });

  assert.equal(result.dryRun, true);
  assert.equal(result.affectedSessionCount, 0);
  assert.equal(result.changedTagCount, 0);
  assert.equal(result.conflicts[0]?.code, 'tag_not_found');
  assert.equal(updates.length, 0);
});
