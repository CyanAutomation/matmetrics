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

  switch (operation.syncIssue.code) {
    case 'idempotency_key_reuse':
      return 'This create key was already used with different session details. The original create is retained; MatMetrics will not retry it with a new key.';
    case 'session_conflict':
      return 'Another session already uses this ID. The previous create is not confirmed; check session history before resolving this operation.';
    case 'revision_conflict':
    case 'revision_mismatch':
    case 'precondition_required':
      return 'The session changed on the server. Review the latest session and resolve this revision conflict.';
    case 'idempotency_not_supported':
      return 'This create may have reached storage without duplicate protection. It will not be sent again automatically; check session history before resolving it.';
    case 'idempotency_unavailable':
      return 'The create is saved in this browser. The server has not confirmed an idempotent storage route; retry after the service is available.';
  }

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
