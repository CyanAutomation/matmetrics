import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __configureSessionListCacheForTests,
  cacheSessionList,
  getOrLoadSessionList,
  getCachedSessionList,
  invalidateSessionListCache,
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

test('concurrent cold session list requests share one load', async () => {
  __configureSessionListCacheForTests();
  let loads = 0;
  let releaseLoad!: (value: ReturnType<typeof payload>) => void;
  const load = () => {
    loads += 1;
    return new Promise<ReturnType<typeof payload>>((resolve) => {
      releaseLoad = resolve;
    });
  };

  const first = getOrLoadSessionList('user', undefined, load);
  const second = getOrLoadSessionList('user', undefined, load);
  assert.equal(loads, 1);
  releaseLoad(payload('shared'));

  assert.equal((await first).sessions[0].id, 'shared');
  assert.equal((await second).sessions[0].id, 'shared');
  __configureSessionListCacheForTests();
});

test('invalidating during a load prevents the stale result being cached', async () => {
  __configureSessionListCacheForTests();
  let releaseLoad!: (value: ReturnType<typeof payload>) => void;
  const pending = getOrLoadSessionList(
    'user',
    undefined,
    () => new Promise((resolve) => { releaseLoad = resolve; })
  );
  invalidateSessionListCache('user', undefined);
  releaseLoad(payload('stale'));

  assert.equal((await pending).sessions[0].id, 'stale');
  assert.equal(getCachedSessionList('user', undefined), undefined);
  __configureSessionListCacheForTests();
});
