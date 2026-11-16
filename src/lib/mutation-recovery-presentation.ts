import type { SyncOperation } from './sync-queue';

export function getRecoveryOperationLabel(operation: SyncOperation): string {
  if (
    operation.type === 'DELETE' &&
    !operation.session &&
    operation.syncIssue &&
    operation.syncIssue.status !== 404
  ) {
    return 'Deletion is unresolved; no saved session copy is available. Refresh sessions before discarding this recovery item.';
  }
  if (!operation.syncIssue) return 'Pending';

  const status = operation.syncIssue.status
    ? ` · HTTP ${operation.syncIssue.status}`
    : '';
  switch (operation.syncIssue.type) {
    case 'conflict':
      return `Conflict needs review${status}`;
    case 'authentication':
      return `Sign-in required${status}`;
    case 'rejected':
      return `Rejected; review or correct${status}`;
  }
}
