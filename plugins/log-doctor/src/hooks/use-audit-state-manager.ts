import { useCallback, useState } from 'react';
import { saveSessionAudit } from '@/lib/user-preferences';
import { useToast } from '@/hooks/use-toast';
import type { SessionAudit, AuditFlagCode } from '@/lib/types';
import type { AuditSessionResult } from '../components/log-doctor-state';

/**
 * Manages audit result state and persistence for log-doctor.
 * Consolidates audit handlers: markResolved, dismissForNow, ignoreRule, unignoreRule.
 */
export const useAuditStateManager = (
  userId: string | null,
  initialResults: AuditSessionResult[]
) => {
  const [auditResults, setAuditResults] = useState<AuditSessionResult[]>(initialResults);
  const { toast } = useToast();

  /**
   * Generic handler to update audit state for a session.
   * Saves to Firebase and updates local state.
   */
  const updateAuditResult = useCallback(
    async (
      sessionId: string,
      updater: (existing: AuditSessionResult) => Partial<AuditSessionResult>,
      toastConfig: {
        successTitle: string;
        successDescription: (date: string) => string;
        errorMessage: string;
      }
    ): Promise<void> => {
      if (!userId) return;

      const existing = auditResults.find((r) => r.sessionId === sessionId);
      if (!existing) return;

      const updated = { ...existing, ...updater(existing) };

      const audit: SessionAudit = {
        sessionId,
        flags: updated.flags,
        reviewedAt: updated.reviewedAt,
        ignoredRules: updated.ignoredRules,
      };

      try {
        await saveSessionAudit(userId, sessionId, audit);
        setAuditResults((prev) =>
          prev.map((r) => (r.sessionId === sessionId ? updated : r))
        );
        toast({
          title: toastConfig.successTitle,
          description: toastConfig.successDescription(existing.sessionDate),
        });
      } catch (error) {
        console.error('Failed to update audit result:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: toastConfig.errorMessage,
        });
      }
    },
    [userId, auditResults, toast]
  );

  const markResolved = useCallback(
    (sessionId: string): Promise<void> => {
      return updateAuditResult(
        sessionId,
        () => ({
          reviewedAt: new Date().toISOString(),
        }),
        {
          successTitle: 'Marked fixed',
          successDescription: (date) => `Session from ${date} is marked as fixed.`,
          errorMessage: 'Failed to mark session as fixed.',
        }
      );
    },
    [updateAuditResult]
  );

  const dismissForNow = useCallback(
    (sessionId: string): Promise<void> => {
      return updateAuditResult(
        sessionId,
        (existing) => ({
          reviewedAt: undefined,
          ignoredRules: existing.flags.map((flag) => flag.code),
        }),
        {
          successTitle: 'Dismissed for now',
          successDescription: (date) =>
            `All checks for ${date} are dismissed for now.`,
          errorMessage: 'Failed to dismiss checks for now.',
        }
      );
    },
    [updateAuditResult]
  );

  const ignoreRule = useCallback(
    (sessionId: string, code: AuditFlagCode): Promise<void> => {
      return updateAuditResult(
        sessionId,
        (existing) => ({
          ignoredRules: existing.ignoredRules.includes(code)
            ? existing.ignoredRules
            : [...existing.ignoredRules, code],
        }),
        {
          successTitle: 'Check dismissed',
          successDescription: () =>
            'This check will no longer flag this session.',
          errorMessage: 'Failed to dismiss check.',
        }
      );
    },
    [updateAuditResult]
  );

  const unignoreRule = useCallback(
    (sessionId: string, code: AuditFlagCode): Promise<void> => {
      return updateAuditResult(
        sessionId,
        (existing) => ({
          ignoredRules: existing.ignoredRules.filter((c) => c !== code),
        }),
        {
          successTitle: 'Check undismissed',
          successDescription: () =>
            'This check will now flag this session again.',
          errorMessage: 'Failed to undismiss check.',
        }
      );
    },
    [updateAuditResult]
  );

  return {
    auditResults,
    setAuditResults,
    markResolved,
    dismissForNow,
    ignoreRule,
    unignoreRule,
  };
};
