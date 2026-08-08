export {
  initializeSyncLeaseModule,
  setActiveSyncLease,
  readSyncLease,
  tryAcquireSyncLease,
  releaseSyncLease,
  randomBackoffMs,
  randomVerifyDelayMs,
  createSyncLeaseNonce,
  getNextSyncLeaseEpoch,
} from './sync-lease-core';
export type {
  SyncLease,
  ActiveSyncLease,
  LeaseTakeoverReason,
  LeaseTakeoverDiagnosticPayload,
} from './sync-lease-core';
export {
  SYNC_LOCK_BACKOFF_MIN_MS,
  SYNC_LOCK_BACKOFF_MAX_MS,
  SYNC_LOCK_VERIFY_DELAY_MIN_MS,
  SYNC_LOCK_VERIFY_DELAY_MAX_MS,
} from './sync-lease-core';
