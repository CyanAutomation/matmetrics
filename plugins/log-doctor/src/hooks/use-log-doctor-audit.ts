'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import {
  getSessionAudit,
  saveSessionAudit,
  getAuditConfig,
  getAuditMode,
  getLastAuditRun,
  saveLastAuditRun,
  saveAuditConfig,
} from '@/lib/user-preferences';
import { getSessions } from '@/lib/storage';
import { runAuditRulesForAllSessions } from '../lib/audit-rules';
import type {
  AuditFlagCode,
  AuditMode,
  AuditRunResult,
  JudoSession,
  SessionAudit,
  AuditConfig,
} from '@/lib/types';
import type {
  AuditSessionResult,
} from '../components/log-doctor-state';

type AuditStep = 'run-check' | 'review-findings' | 'resolve-findings';

interface UseLogDoctorAuditState {
  activeTab: 'validation' | 'audit';
  auditConfig: AuditConfig;
  auditMode: AuditMode;
  auditResults: AuditSessionResult[];
  reviewSessionId: string | null;
  auditRanAt: string | null;
  auditStep: AuditStep;
  auditFeedbackState: string;
  auditNeedsAttentionCount: number;
  firstSessionNeedingAttention: AuditSessionResult | undefined;
}

interface UseLogDoctorAuditActions {
  setActiveTab: (tab: 'validation' | 'audit') => void;
  handleTabChange: (tabId: string) => void;
  handleRunAudit: () => void;
  handleReviewSession: (sessionId: string) => void;
  handleCloseReview: () => void;
  handleUpdateAuditConfig: (
    newConfig: AuditConfig,
    mode: AuditMode
  ) => Promise<void>;
  handleMarkResolved: (sessionId: string) => Promise<void>;
  handleDismissForNow: (sessionId: string) => Promise<void>;
  handleIgnoreRule: (sessionId: string, code: AuditFlagCode) => Promise<void>;
  handleUnignoreRule: (sessionId: string, code: AuditFlagCode) => Promise<void>;
  reviewSession: AuditSessionResult | null;
}

export function useLogDoctorAudit(): UseLogDoctorAuditState &
  UseLogDoctorAuditActions {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    feedbackState: auditFeedbackState,
    startLoading: startAuditLoading,
    showSuccess: showAuditSuccess,
  } = useActionFeedback();

  const [activeTab, setActiveTab] = useState<'validation' | 'audit'>(
    'validation'
  );
  const [auditConfig, setAuditConfig] = useState(getAuditConfig());
  const [auditMode, setAuditMode] = useState<AuditMode>(getAuditMode());
  const [auditResults, setAuditResults] = useState<AuditSessionResult[]>([]);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [auditRanAt, setAuditRanAt] = useState<string | null>(null);
  const [auditStep, setAuditStep] = useState<AuditStep>('run-check');

  // Load persisted audit results on mount
  useEffect(() => {
    const lastRun = getLastAuditRun();
    if (lastRun) {
      const results: AuditSessionResult[] = lastRun.sessions.map((session) => ({
        ...session,
        reviewedAt: undefined,
        ignoredRules: [],
      }));
      setAuditResults(results);
      setAuditRanAt(lastRun.ranAt);
      setAuditStep('review-findings');
    }
  }, []);

  const handleTabChange = useCallback((tabId: string) => {
    if (tabId === 'validation' || tabId === 'audit') {
      setActiveTab(tabId);
    }
  }, []);

  const handleRunAudit = useCallback((): void => {
    startAuditLoading();
    try {
      const sessions: JudoSession[] = getSessions();
      const rawResults = runAuditRulesForAllSessions(sessions, auditConfig);

      // Merge with persisted audit state (reviews, ignored rules)
      const merged: AuditSessionResult[] = rawResults.map((result) => {
        const persisted = getSessionAudit(result.sessionId);
        return {
          sessionId: result.sessionId,
          sessionDate: result.sessionDate,
          flags: result.flags,
          reviewedAt: persisted?.reviewedAt,
          ignoredRules: persisted?.ignoredRules ?? [],
        };
      });

      const now = new Date().toISOString();
      const runResult: AuditRunResult = {
        sessions: merged.map((m) => ({
          sessionId: m.sessionId,
          sessionDate: m.sessionDate,
          flags: m.flags,
        })),
        ranAt: now,
      };

      // Save to Firebase and localStorage
      if (user?.uid) {
        saveLastAuditRun(user.uid, runResult).catch((err) => {
          console.error('Failed to save audit result:', err);
        });
      }

      setAuditResults(merged);
      setAuditRanAt(now);
      setAuditStep('review-findings');
      showAuditSuccess();
    } finally {
    }
  }, [user?.uid, auditConfig, startAuditLoading, showAuditSuccess]);

  const handleReviewSession = useCallback((sessionId: string): void => {
    setAuditStep('resolve-findings');
    setReviewSessionId(sessionId);
  }, []);

  const handleCloseReview = useCallback((): void => {
    setReviewSessionId(null);
  }, []);

  const handleUpdateAuditConfig = useCallback(
    async (
      newConfig: AuditConfig,
      mode: AuditMode
    ): Promise<void> => {
      if (!user?.uid) return;
      await saveAuditConfig(user.uid, newConfig, mode);
      setAuditMode(mode);
      setAuditConfig(newConfig);
    },
    [user?.uid]
  );

  const handleMarkResolved = useCallback(
    async (sessionId: string): Promise<void> => {
      if (!user?.uid) return;
      const existing = auditResults.find((r) => r.sessionId === sessionId);
      if (!existing) return;

      const now = new Date().toISOString();
      const audit: SessionAudit = {
        sessionId,
        flags: existing.flags,
        reviewedAt: now,
        ignoredRules: existing.ignoredRules,
      };

      try {
        await saveSessionAudit(user.uid, sessionId, audit);
        setAuditResults((prev) =>
          prev.map((r) =>
            r.sessionId === sessionId ? { ...r, reviewedAt: now } : r
          )
        );
        toast({
          title: 'Marked fixed',
          description: `Session from ${existing.sessionDate} is marked as fixed.`,
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to mark session as fixed.',
        });
      }
    },
    [user?.uid, auditResults, toast]
  );

  const handleDismissForNow = useCallback(
    async (sessionId: string): Promise<void> => {
      if (!user?.uid) return;
      const existing = auditResults.find((r) => r.sessionId === sessionId);
      if (!existing) return;

      const dismissedRules = existing.flags.map((flag) => flag.code);

      const audit: SessionAudit = {
        sessionId,
        flags: existing.flags,
        reviewedAt: undefined,
        ignoredRules: dismissedRules,
      };

      try {
        await saveSessionAudit(user.uid, sessionId, audit);
        setAuditResults((prev) =>
          prev.map((r) =>
            r.sessionId === sessionId
              ? { ...r, reviewedAt: undefined, ignoredRules: dismissedRules }
              : r
          )
        );
        toast({
          title: 'Dismissed for now',
          description: `All checks for ${existing.sessionDate} are dismissed for now.`,
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to dismiss checks for now.',
        });
      }
    },
    [user?.uid, auditResults, toast]
  );

  const handleIgnoreRule = useCallback(
    async (sessionId: string, code: AuditFlagCode): Promise<void> => {
      if (!user?.uid) return;
      const existing = auditResults.find((r) => r.sessionId === sessionId);
      if (!existing) return;

      const updatedIgnored = existing.ignoredRules.includes(code)
        ? existing.ignoredRules
        : [...existing.ignoredRules, code];

      const audit: SessionAudit = {
        sessionId,
        flags: existing.flags,
        reviewedAt: existing.reviewedAt,
        ignoredRules: updatedIgnored,
      };

      try {
        await saveSessionAudit(user.uid, sessionId, audit);
        setAuditResults((prev) =>
          prev.map((r) =>
            r.sessionId === sessionId ? { ...r, ignoredRules: updatedIgnored } : r
          )
        );
        toast({
          title: 'Check dismissed',
          description: 'This check will no longer flag this session.',
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to dismiss check.',
        });
      }
    },
    [user?.uid, auditResults, toast]
  );

  const handleUnignoreRule = useCallback(
    async (sessionId: string, code: AuditFlagCode): Promise<void> => {
      if (!user?.uid) return;
      const existing = auditResults.find((r) => r.sessionId === sessionId);
      if (!existing) return;

      const updatedIgnored = existing.ignoredRules.filter((c) => c !== code);

      const audit: SessionAudit = {
        sessionId,
        flags: existing.flags,
        reviewedAt: existing.reviewedAt,
        ignoredRules: updatedIgnored,
      };

      try {
        await saveSessionAudit(user.uid, sessionId, audit);
        setAuditResults((prev) =>
          prev.map((r) =>
            r.sessionId === sessionId ? { ...r, ignoredRules: updatedIgnored } : r
          )
        );
        toast({
          title: 'Check undismissed',
          description: 'This check will now flag this session again.',
        });
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to undismiss check.',
        });
      }
    },
    [user?.uid, auditResults, toast]
  );

  const auditNeedsAttentionCount = auditResults.filter(
    (r) =>
      !r.reviewedAt && r.flags.some((f) => !r.ignoredRules.includes(f.code))
  ).length;

  const firstSessionNeedingAttention = auditResults.find(
    (r) =>
      !r.reviewedAt && r.flags.some((f) => !r.ignoredRules.includes(f.code))
  );

  const reviewSession =
    auditResults.find((r) => r.sessionId === reviewSessionId) ?? null;

  return {
    activeTab,
    auditConfig,
    auditMode,
    auditResults,
    reviewSessionId,
    auditRanAt,
    auditStep,
    auditFeedbackState,
    auditNeedsAttentionCount,
    firstSessionNeedingAttention,
    setActiveTab,
    handleTabChange,
    handleRunAudit,
    handleReviewSession,
    handleCloseReview,
    handleUpdateAuditConfig,
    handleMarkResolved,
    handleDismissForNow,
    handleIgnoreRule,
    handleUnignoreRule,
    reviewSession,
  };
}
