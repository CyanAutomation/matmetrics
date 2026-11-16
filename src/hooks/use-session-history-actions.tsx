'use client';

import { useState } from 'react';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { deleteSession, saveSession } from '@/lib/storage';
import type { JudoSession } from '@/lib/types';
import type { SessionSnapshot } from '@/lib/keiko-session-revision';

export function useSessionHistoryActions(
  onRefresh: () => void,
  clearHistoryReview: (sessionId: string) => void
) {
  const { toast } = useToast();
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );

  const handleDelete = async (session: JudoSession) => {
    if (deletingSessionId) return;

    setDeletingSessionId(session.id);
    try {
      const result = await deleteSession(
        session.id,
        (session as SessionSnapshot).keikoRevision
      );
      onRefresh();
      toast({
        title: 'Session deleted',
        description:
          result.status === 'queued'
            ? 'The change is saved locally and queued to sync when the connection is ready.'
            : 'The training session has been removed from your history.',
        action: (
          <ToastAction
            altText="Restore deleted session"
            onClick={() => {
              void saveSession(session)
                .then(() => {
                  onRefresh();
                  toast({
                    title: 'Session restored',
                    description: 'The training session is back in your history.',
                  });
                })
                .catch(() => {
                  toast({
                    variant: 'destructive',
                    title: 'Restore failed',
                    description: 'The training session could not be restored.',
                  });
                });
            }}
          >
            Undo
          </ToastAction>
        ),
      });
      clearHistoryReview(session.id);
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error &&
        typeof error.status === 'number'
          ? error.status
          : undefined;
      const storageFailed =
        error && typeof error === 'object' && 'name' in error &&
        error.name === 'SyncQueuePersistenceError';
      toast({
        variant: 'destructive',
        title: status ? 'Delete needs review' : 'Delete failed',
        description: storageFailed
          ? 'The delete was not saved to Recovery. The session remains available; keep a copy of its details before leaving.'
          : status
            ? 'The server did not confirm deletion. The request is saved in Recovery and the session remains available for review.'
            : 'The session could not be deleted.',
      });
    } finally {
      setDeletingSessionId(null);
    }
  };

  return { deletingSessionId, handleDelete };
}
