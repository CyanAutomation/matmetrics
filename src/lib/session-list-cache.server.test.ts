// fallow-ignore-file unused-file
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __configureSessionListCacheForTests,
  cacheSessionList,
  getCachedSessionList,
} from './session-list-cache.server';

const payload = (id: string) => ({ sessions: [{ id }] as never[], issues: [] });

test('session list cache expires and opportunistically prunes unrelated entries', () => {
  let now = 0;
  __configureSessionListCacheForTests({ maxEntries: 2, now: () => now });
  cacheSessionList('expired', undefined, payload('expired'));
  now = 30_000;
  cacheSessionList('current', undefined, payload('current'));
  cacheSessionList('another', undefined, payload('another'));

  assert.equal(getCachedSessionList('expired', undefined), undefined);
  assert.equal(getCachedSessionList('current', undefined)?.sessions[0].id, 'current');
});

test('session list cache is capacity bounded with LRU access and key isolation', () => {
  __configureSessionListCacheForTests({ maxEntries: 2, now: () => 0 });
  cacheSessionList('one', undefined, payload('one'));
  cacheSessionList('two', undefined, payload('two'));
  assert.ok(getCachedSessionList('one', undefined));
  cacheSessionList('three', undefined, payload('three'));

  assert.equal(getCachedSessionList('two', undefined), undefined);
  assert.equal(getCachedSessionList('one', undefined)?.sessions[0].id, 'one');
  assert.equal(getCachedSessionList('three', undefined)?.sessions[0].id, 'three');
  __configureSessionListCacheForTests();
});
