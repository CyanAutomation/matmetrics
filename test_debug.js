// Minimal reproduction of the failing test
const localStorageMock = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => localStorageMock.get(key) ?? null,
    setItem: (key, value) => localStorageMock.set(key, value),
    removeItem: (key) => localStorageMock.delete(key),
    clear: () => localStorageMock.clear(),
  },
});

// Import sync-queue module
const syncQueueMod = require('./dist/sync-queue.js');
const { queueOperation, getQueue, getSyncQueueStorageKey, __testInternals } = syncQueueMod;

async function test() {
  localStorageMock.clear();
  __testInternals.setLeaseTtlForTests(20);

  const queueKey = getSyncQueueStorageKey();
  let callCount = 0;
  const original = globalThis.localStorage.setItem.bind(globalThis.localStorage);
  
  globalThis.localStorage.setItem = function(key, value) {
    callCount++;
    console.log(`setItem #${callCount}: key=${key}, is_queue=${key === queueKey}`);
    if (key === queueKey) {
      console.log('Setting competitor lease...');
      const leaseKey = 'matmetrics_sync_queue_lock'; // simplified
      original.call(this, leaseKey, JSON.stringify({
        owner: 'competitor',
        nonce: 'comp-nonce',
        epoch: Date.now() + 1000,
        expiresAt: Date.now() + 10000,
      }));
    }
    original.call(this, key, value);
    console.log(`  localStorage now has: ${Array.from(localStorageMock.keys()).join(', ')}`);
  };

  try {
    await queueOperation({
      type: 'CREATE',
      session: { id: 'test', date: '2026-01-01', duration: 60, effort: 3, category: 'Technical', notes: '', techniques: [] },
    });
  } catch (e) {
    console.log('Error in queueOperation:', e);
  }

  const queue = getQueue();
  console.log(`Final queue length: ${queue.length}`);
  console.log(`Expected: 0, Actual: ${queue.length}`);
}

test().catch(console.error);
