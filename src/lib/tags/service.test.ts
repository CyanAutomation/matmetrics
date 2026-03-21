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
  assert.deepEqual(result.affectedSessionIds, []);
  assert.deepEqual(result.affectedTags, []);
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
  assert.deepEqual(result.affectedSessionIds, []);
  assert.deepEqual(result.affectedTags, []);
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
  assert.deepEqual(result.affectedSessionIds, []);
  assert.deepEqual(result.affectedTags, []);
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
  assert.deepEqual(result.affectedSessionIds, []);
  assert.deepEqual(result.affectedTags, []);
  assert.equal(result.conflicts[0]?.code, 'tag_not_found');
  assert.equal(updates.length, 0);
});

test('analysis APIs return accurate impact details for representative datasets', async () => {
  const sessions = [
    makeSession('s1', ['armbar', 'Armbar', 'triangle']),
    makeSession('s2', ['armbar', 'seoi-nage', 'armbar']),
    makeSession('s3', ['triangle', 'tomoe-nage']),
  ];
  const updates: JudoSession[] = [];
  const service = createTagService({
    getSessions: () => sessions,
    updateSession: async (session) => {
      updates.push(session);
      return { status: 'synced' };
    },
  });

  const rename = await service.analyzeRename('armbar', 'juji-gatame');
  assert.equal(rename.dryRun, true);
  assert.equal(rename.affectedSessionCount, 2);
  assert.equal(rename.changedTagCount, 4);
  assert.deepEqual(rename.affectedSessionIds, ['s1', 's2']);
  assert.deepEqual(rename.affectedTags, ['armbar', 'juji-gatame']);
  assert.equal(rename.conflicts.length, 0);

  const merge = await service.analyzeMerge('triangle', 'tomoe-nage');
  assert.equal(merge.dryRun, true);
  assert.equal(merge.affectedSessionCount, 2);
  assert.equal(merge.changedTagCount, 2);
  assert.deepEqual(merge.affectedSessionIds, ['s1', 's3']);
  assert.deepEqual(merge.affectedTags, ['triangle', 'tomoe-nage']);
  assert.equal(merge.conflicts.length, 0);

  const deleteResult = await service.analyzeDelete('armbar');
  assert.equal(deleteResult.dryRun, true);
  assert.equal(deleteResult.affectedSessionCount, 2);
  assert.equal(deleteResult.changedTagCount, 4);
  assert.deepEqual(deleteResult.affectedSessionIds, ['s1', 's2']);
  assert.deepEqual(deleteResult.affectedTags, ['armbar']);
  assert.equal(deleteResult.conflicts.length, 0);

  assert.equal(updates.length, 0);
});

test('rename stops on first failed session update and reports failed ids', async () => {
  const sessions = [
    makeSession('s1', ['armbar']),
    makeSession('s2', ['armbar']),
    makeSession('s3', ['armbar']),
  ];
  const attemptedUpdates: string[] = [];
  const service = createTagService({
    getSessions: () => sessions,
    updateSession: async (session) => {
      attemptedUpdates.push(session.id);
      if (session.id === 's2') {
        throw new Error('write failed');
      }

      const index = sessions.findIndex((item) => item.id === session.id);
      sessions[index] = session;
      return { status: 'synced' };
    },
  });

  const result = await service.renameTag('armbar', 'juji-gatame');

  assert.equal(result.affectedSessionCount, 3);
  assert.equal(result.changedTagCount, 3);
  assert.deepEqual(result.affectedSessionIds, ['s1', 's2', 's3']);
  assert.deepEqual(result.failedSessionIds, ['s2']);
  assert.equal(result.conflicts[0]?.code, 'session_update_failed');
  assert.deepEqual(result.conflicts[0]?.failedSessionIds, ['s2']);
  assert.deepEqual(attemptedUpdates, ['s1', 's2']);

  assert.deepEqual(sessions[0].techniques, ['juji-gatame']);
  assert.deepEqual(sessions[1].techniques, ['armbar']);
  assert.deepEqual(sessions[2].techniques, ['armbar']);
});
