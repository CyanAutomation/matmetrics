'use client';

import { useState, useEffect, useRef } from 'react';
import type { JudoSession, MutationResult } from '@/lib/types';
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
  /** Overrides used by the hook's focused unit tests. */
  operations?: Partial<GuestImportOperations>;
}) {
  const { toast } = useToast();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isImportingGuestData, setIsImportingGuestData] = useState(false);
  const importInFlightRef = useRef<boolean>(false);
  const operations: GuestImportOperations = {
    getGuestSessionsForImport,
    saveSession,
    clearGuestWorkspaceAfterImport,
    retainGuestSessionsAfterPartialImport,
    dismissGuestImport,
    ...deps?.operations,
  };

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
    if (!deps?.userId || importInFlightRef.current) {
      return;
    }

    await operations.dismissGuestImport(deps.userId);
    setIsImportDialogOpen(false);
  };

  const handleImportGuestData = async () => {
    if (!deps?.userId || importInFlightRef.current) {
      return;
    }

    importInFlightRef.current = true;
    setIsImportingGuestData(true);
    try {
      // Do not allow later guest-storage mutations to change this import batch.
      const guestSessions = operations.getGuestSessionsForImport().map(
        (session) =>
          Object.freeze({
            ...session,
            techniques: Object.freeze([...session.techniques]),
          }) as JudoSession
      );
      const results = await Promise.allSettled(
        guestSessions.map(async (session) => ({
          session,
          result: await operations.saveSession(session),
        }))
      );

      const successfulSessions = results.flatMap((entry) =>
        entry.status === 'fulfilled' ? [entry.value] : []
      );
      const permanentlyFailedSessions = results.flatMap((entry, index) =>
        entry.status === 'rejected' && !isIdempotentCreateConflict(entry.reason)
          ? [guestSessions[index]]
          : []
      );
      const importedSessionCount =
        results.length - permanentlyFailedSessions.length;

      if (permanentlyFailedSessions.length === 0) {
        operations.clearGuestWorkspaceAfterImport();
      } else {
        operations.retainGuestSessionsAfterPartialImport(
          permanentlyFailedSessions
        );
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
              ? `${importedSessionCount} session${importedSessionCount === 1 ? '' : 's'} moved into your account. ${queuedCount} ${queuedCount === 1 ? 'is' : 'are'} queued to finish syncing.`
              : `${importedSessionCount} local session${importedSessionCount === 1 ? '' : 's'} moved into your account.`,
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
      importInFlightRef.current = false;
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

type GuestImportOperations = {
  getGuestSessionsForImport: () => JudoSession[];
  saveSession: (session: JudoSession) => Promise<MutationResult>;
  clearGuestWorkspaceAfterImport: () => void;
  retainGuestSessionsAfterPartialImport: (sessions: JudoSession[]) => void;
  dismissGuestImport: (userId: string) => Promise<void>;
};

function isIdempotentCreateConflict(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
  const normalized = message.toLowerCase();
  return (
    normalized.includes('already exists') &&
    !normalized.includes('different content')
  );
}
