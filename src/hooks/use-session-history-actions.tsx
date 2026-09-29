'use client';

import { useState } from 'react';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { deleteSession, saveSession } from '@/lib/storage';
import type { JudoSession } from '@/lib/types';

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
      const result = await deleteSession(session.id);
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
    } catch {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: 'The session could not be deleted.',
      });
    } finally {
      setDeletingSessionId(null);
    }
  };

  return { deletingSessionId, handleDelete };
}
