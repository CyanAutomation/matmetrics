'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clipboard, Download, RotateCw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { SessionSnapshot } from '@/lib/keiko-session-revision';
import {
  discardFailedMutation,
  getMutationRecoveryQueue,
  retryCloudSync,
} from '@/lib/storage';
import {
  getEligiblePendingOperations,
  getSyncQueueStorageError,
  type SyncOperation,
} from '@/lib/sync-queue';
import { buildMutationRecoveryExport } from '@/lib/mutation-recovery';
import { getRecoveryOperationLabel } from '@/lib/mutation-recovery-presentation';

type MutationRecoveryPanelProps = {
  onSignIn?: () => void;
  isOnline: boolean;
  isSyncing: boolean;
};

function getOperationId(operation: SyncOperation): string {
  const sessionId = operation.type === 'DELETE' ? operation.id : operation.session.id;
  return `${operation.type}:${sessionId}:${operation.queuedAt}`;
}

function getOperationSession(
  operation: SyncOperation
): SessionSnapshot | undefined {
  switch (operation.type) {
    case 'DELETE':
      return operation.session;
    case 'CREATE':
    case 'UPDATE':
      return operation.session;
  }
}

export function MutationRecoveryPanel({
  onSignIn,
  isOnline,
  isSyncing,
}: MutationRecoveryPanelProps) {
  const [queue, setQueue] = useState<SyncOperation[]>([]);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [confirmingOperationId, setConfirmingOperationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const refresh = useCallback(() => {
    setQueue(getMutationRecoveryQueue());
    setStorageUnavailable(getSyncQueueStorageError() !== null);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 750);
    window.addEventListener('storage', refresh);
    window.addEventListener('storageSync', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('storageSync', refresh);
    };
  }, [refresh]);

  const failedOperations = queue.filter((operation) => operation.syncIssue);
  const pendingOperations = queue.filter((operation) => !operation.syncIssue);
  const eligiblePendingOperations = getEligiblePendingOperations(queue);
  const eligibleOperationIds = new Set(eligiblePendingOperations.map(getOperationId));
  const blockedPendingCount = pendingOperations.length - eligiblePendingOperations.length;

  if (queue.length === 0 && !storageUnavailable) return null;

  const recoveryExport = buildMutationRecoveryExport(queue);
  const recoveryJson = JSON.stringify(recoveryExport, null, 2);

  const downloadExport = () => {
    const blob = new Blob([recoveryJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `matmetrics-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Recovery JSON downloaded. Store it somewhere safe.');
    setMessageIsError(false);
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(recoveryJson);
      setMessage('Recovery JSON copied to the clipboard.');
      setMessageIsError(false);
    } catch {
      setMessage('Clipboard access is unavailable. Download the recovery JSON instead.');
      setMessageIsError(true);
    }
  };

  const discardOperation = async (operation: SyncOperation) => {
    try {
      await discardFailedMutation(operation);
      setConfirmingOperationId(null);
      setMessage('The selected recovery operation was discarded.');
      setMessageIsError(false);
      refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The recovery operation could not be discarded. It remains in the queue.'
      );
      setMessageIsError(true);
    }
  };

  return (
    <Alert
      className="space-y-4"
      role={storageUnavailable ? 'alert' : 'status'}
      variant={storageUnavailable ? 'destructive' : 'default'}
    >
      <AlertTitle>Unsynchronised session changes</AlertTitle>
      <AlertDescription className="space-y-4">
        {storageUnavailable ? (
          <p>
            MatMetrics could not read or update the browser recovery queue. A
            queued message cannot be treated as saved until storage is available.
            Keep any open session form open and copy its contents before leaving.
          </p>
        ) : (
          <p>
            {failedOperations.length > 0
              ? `${failedOperations.length} operation${failedOperations.length === 1 ? '' : 's'} need attention. Export the recovery data before discarding anything.`
              : `${pendingOperations.length} operation${pendingOperations.length === 1 ? '' : 's'} are waiting to sync.`}
          </p>
        )}

        {queue.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={downloadExport}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Download recovery JSON
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyExport()}>
              <Clipboard className="mr-2 h-4 w-4" aria-hidden="true" />
              Copy recovery JSON
            </Button>
            {pendingOperations.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => retryCloudSync()}
                disabled={!isOnline || isSyncing || eligiblePendingOperations.length === 0}
              >
                <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
                {eligiblePendingOperations.length === 0 ? 'No safe pending changes to retry' : 'Retry pending changes'}
              </Button>
            )}
          </div>
        )}

        {blockedPendingCount > 0 && eligiblePendingOperations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Pending changes are waiting behind an earlier conflict, sign-in failure, or rejected operation for the same session. Review that operation before retrying.
          </p>
        )}

        {queue.length > 0 && (
          <ul className="space-y-3" aria-label="Unsynchronised operations">
            {queue.map((operation) => {
              const operationId = getOperationId(operation);
              const session = getOperationSession(operation);
              const sessionId = operation.type === 'DELETE' ? operation.id : operation.session.id;
              const blockedByIssue = !operation.syncIssue && !eligibleOperationIds.has(operationId);
              const confirming = confirmingOperationId === operationId;
              return (
                <li
                  key={operationId}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-foreground">
                        {operation.type} · {sessionId}
                        {session?.date ? ` · ${session.date}` : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {blockedByIssue
                          ? 'Waiting behind an earlier operation that needs review'
                          : getRecoveryOperationLabel(operation)}
                        {operation.type !== 'CREATE' && operation.expectedRevision !== undefined
                          ? ` · Expected revision ${operation.expectedRevision}`
                          : ''}
                      </p>
                    </div>
                    {operation.syncIssue?.type === 'authentication' && onSignIn && (
                      <Button type="button" size="sm" variant="outline" onClick={onSignIn}>
                        Sign in to resume
                      </Button>
                    )}
                    {operation.syncIssue && !confirming && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingOperationId(operationId)}
                        aria-label={`Discard ${operation.type.toLowerCase()} for ${sessionId}`}
                      >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Discard
                      </Button>
                    )}
                  </div>
                  {confirming && (
                    <div className="mt-3 space-y-2 rounded-md bg-muted p-3" role="alertdialog" aria-label="Confirm discard">
                      <p className="text-sm">
                        Remove this failed operation and its saved recovery copy from this browser?
                        Export it first if you may need the data later.
                      </p>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="destructive" onClick={() => void discardOperation(operation)}>
                          Discard operation
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingOperationId(null)}>
                          Keep it
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {message && (
          <p className="text-sm" role={messageIsError ? 'alert' : 'status'}>
            {message}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
