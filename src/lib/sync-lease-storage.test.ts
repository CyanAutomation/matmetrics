import assert from 'node:assert/strict';
import test from 'node:test';

import {
  leaseClaimsMatch,
  leaseIdentityMatches,
  parseSyncLeaseValue,
} from './sync-lease-storage';
import type { SyncLease } from './sync-lease-core';

const lease: SyncLease = {
  owner: 'owner-a',
  expiresAt: 123_456,
  nonce: 'nonce-a',
  epoch: 42,
};

test('parseSyncLeaseValue rejects empty, malformed, and invalid values', () => {
  assert.equal(parseSyncLeaseValue(null), null);
  assert.equal(parseSyncLeaseValue(''), null);
  assert.equal(parseSyncLeaseValue('{not-json}'), null);
  assert.equal(
    parseSyncLeaseValue(JSON.stringify({ ...lease, epoch: '42' })),
    null
  );
  assert.equal(
    parseSyncLeaseValue(JSON.stringify({ ...lease, expiresAt: null })),
    null
  );
  assert.equal(
    parseSyncLeaseValue(JSON.stringify({ owner: lease.owner })),
    null
  );
});

test('parseSyncLeaseValue returns the validated lease shape', () => {
  assert.deepEqual(parseSyncLeaseValue(JSON.stringify(lease)), lease);
  assert.deepEqual(
    parseSyncLeaseValue(JSON.stringify({ ...lease, extra: 'ignored' })),
    lease
  );
});

test('parseSyncLeaseValue rejects non-finite numeric claims and non-object JSON', () => {
  assert.equal(
    parseSyncLeaseValue(JSON.stringify({ ...lease, expiresAt: Infinity })),
    null
  );
  assert.equal(
    parseSyncLeaseValue(JSON.stringify({ ...lease, epoch: NaN })),
    null
  );
  assert.equal(parseSyncLeaseValue('[]'), null);
  assert.equal(parseSyncLeaseValue('null'), null);
});

test('leaseClaimsMatch requires every claim field to match', () => {
  assert.equal(leaseClaimsMatch(lease, lease), true);
  for (const field of ['owner', 'expiresAt', 'nonce', 'epoch'] as const) {
    assert.equal(
      leaseClaimsMatch(
        {
          ...lease,
          [field]: field === 'expiresAt' || field === 'epoch' ? 99 : 'other',
        },
        lease
      ),
      false,
      `expected ${field} mismatch to fail`
    );
  }
  assert.equal(leaseClaimsMatch(null, lease), false);
});

test('leaseIdentityMatches ignores expiration but requires ownership identity', () => {
  assert.equal(
    leaseIdentityMatches({ ...lease, expiresAt: lease.expiresAt + 1 }, lease),
    true
  );
  assert.equal(
    leaseIdentityMatches({ ...lease, owner: 'owner-b' }, lease),
    false
  );
  assert.equal(
    leaseIdentityMatches({ ...lease, nonce: 'nonce-b' }, lease),
    false
  );
  assert.equal(
    leaseIdentityMatches({ ...lease, epoch: lease.epoch + 1 }, lease),
    false
  );
  assert.equal(leaseIdentityMatches(null, lease), false);
});

test('lease matchers reject candidates with any missing claim', () => {
  const partial = { ...lease } as Partial<SyncLease>;
  delete partial.nonce;

  assert.equal(leaseClaimsMatch(partial as SyncLease, lease), false);
  assert.equal(leaseIdentityMatches(partial as SyncLease, lease), false);
});
