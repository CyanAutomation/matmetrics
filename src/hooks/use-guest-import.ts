'use client';

import { useState, useEffect } from 'react';
import {
  clearGuestWorkspaceAfterImport,
  dismissGuestImport,
  getGuestSessionsForImport,
  retainGuestSessionsAfterPartialImport,
  shouldPromptGuestImport,
} from '@/lib/guest-mode';
import { saveSession } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';

/**
 * Manages guest session import flow, dialog state, and import operations
 */
export function useGuestImport(deps?: {
  userId?: string | null;
  sessionsLength?: number;
  onImportComplete?: () => void;
}) {
  const { toast } = useToast();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImportingGuestData, setIsImportingGuestData] = useState(false);

  // Update import dialog visibility based on guest import status
  useEffect(() => {
    if (!deps?.userId) {
      setIsImportDialogOpen(false);
      return;
    }

    let cancelled = false;

    const updateImportDialogState = async () => {
      const shouldPrompt = await shouldPromptGuestImport(deps.userId!);
      if (!cancelled) {
        setIsImportDialogOpen(shouldPrompt);
      }
    };

    void updateImportDialogState();

    return () => {
      cancelled = true;
    };
  }, [deps?.userId, deps?.sessionsLength]);

  const handleDismissGuestImport = async () => {
    if (!deps?.userId) {
      return;
    }

    await dismissGuestImport(deps.userId);
    setIsImportDialogOpen(false);
  };

  const handleImportGuestData = async () => {
    if (!deps?.userId) {
      return;
    }

    setIsImportingGuestData(true);
    try {
      const guestSessions = getGuestSessionsForImport();
      const results = await Promise.allSettled(
        guestSessions.map(async (session) => ({
          session,
          result: await saveSession(session),
        }))
      );

      const successfulSessions = results.flatMap((entry) =>
        entry.status === 'fulfilled' ? [entry.value] : []
      );
      const permanentlyFailedSessions = results.flatMap((entry, index) =>
        entry.status === 'rejected' ? [guestSessions[index]] : []
      );

      if (permanentlyFailedSessions.length === 0) {
        clearGuestWorkspaceAfterImport();
      } else {
        retainGuestSessionsAfterPartialImport(permanentlyFailedSessions);
      }

      if (permanentlyFailedSessions.length === 0) {
        setIsImportDialogOpen(false);
        const queuedCount = successfulSessions.filter(
          ({ result }) => result.status === 'queued'
        ).length;
        toast({
          title: 'Guest sessions imported',
          description:
            queuedCount > 0
              ? `${successfulSessions.length} session${successfulSessions.length === 1 ? '' : 's'} moved into your account. ${queuedCount} ${queuedCount === 1 ? 'is' : 'are'} queued to finish syncing.`
              : `${successfulSessions.length} local session${successfulSessions.length === 1 ? '' : 's'} moved into your account.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Guest import incomplete',
          description: `${successfulSessions.length} session${successfulSessions.length === 1 ? '' : 's'} imported, ${permanentlyFailedSessions.length} left in guest mode for retry.`,
        });
      }

      deps?.onImportComplete?.();
    } finally {
      setIsImportingGuestData(false);
    }
  };

  return {
    isImportDialogOpen,
    setIsImportDialogOpen,
    isImportingGuestData,
    handleDismissGuestImport,
    handleImportGuestData,
  };
}
