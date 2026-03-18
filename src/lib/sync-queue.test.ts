import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearQueue,
  getSyncQueueStorageKey,
  getQueue,
  queueOperation,
  setQueue,
  type SyncOperation,
} from './sync-queue';
import type { JudoSession } from './types';

class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  clear(): void {
    this.store.clear();
  }
}

const localStorageMock = new LocalStorageMock();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = localStorageMock;

function makeSession(id: string): JudoSession {
  return {
    id,
    date: '2026-01-01',
    duration: 60,
    effort: 3,
    category: 'Technical',
    notes: 'test',
    techniques: [],
  };
}

function createOp(id: string, queuedAt: number): SyncOperation {
  return {
    type: 'UPDATE',
    session: makeSession(id),
    queuedAt,
  };
}

function resetQueue(initialQueue?: SyncOperation[]): void {
  localStorage.clear();
  if (initialQueue) {
    localStorage.setItem(
      getSyncQueueStorageKey(),
      JSON.stringify(initialQueue)
    );
  }
}

test('queueOperation timestamps operations and preserves insertion order', () => {
  resetQueue();

  queueOperation({ type: 'CREATE', session: makeSession('session-1') });
  queueOperation({ type: 'UPDATE', session: makeSession('session-1') });

  const queue = getQueue();
  assert.equal(queue.length, 2);
  assert.ok(queue.every((operation) => Number.isFinite(operation.queuedAt)));
  assert.ok(queue[1].queuedAt >= queue[0].queuedAt);
});

test('setQueue preserves a newer concurrent operation with the same identity', () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentNewerOperation = createOp('session-1', 200);

  resetQueue([concurrentNewerOperation]);

  setQueue([baseOperation], [baseOperation]);

  assert.deepEqual(getQueue(), [concurrentNewerOperation]);
});

test('clearQueue keeps a newer concurrent operation instead of deleting it', () => {
  const baseOperation = createOp('session-1', 100);
  const concurrentNewerOperation = createOp('session-1', 200);

  resetQueue([concurrentNewerOperation]);

  clearQueue([baseOperation]);

  assert.deepEqual(getQueue(), [concurrentNewerOperation]);
});

test('clearQueue removes the persisted storage key when there is no concurrent work', () => {
  resetQueue([createOp('session-1', 100)]);

  clearQueue([createOp('session-1', 100)]);

  assert.equal(localStorage.getItem(getSyncQueueStorageKey()), null);
  assert.deepEqual(getQueue(), []);
});
