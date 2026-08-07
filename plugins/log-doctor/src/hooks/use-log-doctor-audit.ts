'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import {
  getAuditConfig,
  getAuditMode,
  getLastAuditRun,
  getSessionAudit,
  saveAuditConfig,
  saveLastAuditRun,
} from '@/lib/user-preferences';
import { getSessions } from '@/lib/storage';
import { runAuditRulesForAllSessions } from '../lib/audit-rules';
import type {
  AuditFlagCode,
  AuditMode,
  AuditRunResult,
  AuditConfig,
} from '@/lib/types';
import type { AuditSessionResult } from '../components/log-doctor-state';
import { useAuditStateManager } from './use-audit-state-manager';

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
  setAuditStep: (step: AuditStep) => void;
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
  const {
    feedbackState: auditFeedbackState,
    startLoading,
    showSuccess,
  } = useActionFeedback();
  const [activeTab, setActiveTab] = useState<'validation' | 'audit'>(
    'validation'
  );
  const [auditConfig, setAuditConfig] = useState(getAuditConfig());
  const [auditMode, setAuditMode] = useState<AuditMode>(getAuditMode());
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [auditRanAt, setAuditRanAt] = useState<string | null>(null);
  const [auditStep, setAuditStep] = useState<AuditStep>('run-check');
  const {
    auditResults,
    setAuditResults,
    markResolved,
    dismissForNow,
    ignoreRule,
    unignoreRule,
  } = useAuditStateManager(user?.uid ?? null, []);

  useEffect(() => {
    const lastRun = getLastAuditRun();
    if (!lastRun) return;

    setAuditResults(
      lastRun.sessions.map((session) => ({
        ...session,
        reviewedAt: undefined,
        ignoredRules: [],
      }))
    );
    setAuditRanAt(lastRun.ranAt);
    setAuditStep('review-findings');
  }, [setAuditResults]);

  const handleTabChange = useCallback((tabId: string): void => {
    if (tabId === 'validation' || tabId === 'audit') setActiveTab(tabId);
  }, []);

  const handleRunAudit = useCallback((): void => {
    startLoading();
    const rawResults = runAuditRulesForAllSessions(getSessions(), auditConfig);
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
    const runResult: AuditRunResult = {
      sessions: merged.map(({ sessionId, sessionDate, flags }) => ({
        sessionId,
        sessionDate,
        flags,
      })),
      ranAt: new Date().toISOString(),
    };

    if (user?.uid) {
      saveLastAuditRun(user.uid, runResult).catch((error) => {
        console.error('Failed to save audit result:', error);
      });
    }
    setAuditResults(merged);
    setAuditRanAt(runResult.ranAt);
    setAuditStep('review-findings');
    showSuccess();
  }, [auditConfig, setAuditResults, showSuccess, startLoading, user]);

  const handleReviewSession = useCallback((sessionId: string): void => {
    setAuditStep('resolve-findings');
    setReviewSessionId(sessionId);
  }, []);

  const handleCloseReview = useCallback((): void => {
    setReviewSessionId(null);
  }, []);

  const handleUpdateAuditConfig = useCallback(
    async (newConfig: AuditConfig, mode: AuditMode): Promise<void> => {
      if (!user?.uid) return;
      await saveAuditConfig(user.uid, newConfig, mode);
      setAuditMode(mode);
      setAuditConfig(newConfig);
    },
    [user]
  );

  const auditNeedsAttentionCount = auditResults.filter(
    (result) =>
      !result.reviewedAt &&
      result.flags.some((flag) => !result.ignoredRules.includes(flag.code))
  ).length;
  const firstSessionNeedingAttention = auditResults.find(
    (result) =>
      !result.reviewedAt &&
      result.flags.some((flag) => !result.ignoredRules.includes(flag.code))
  );
  const reviewSession =
    auditResults.find((result) => result.sessionId === reviewSessionId) ?? null;

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
    setAuditStep,
    handleTabChange,
    handleRunAudit,
    handleReviewSession,
    handleCloseReview,
    handleUpdateAuditConfig,
    handleMarkResolved: markResolved,
    handleDismissForNow: dismissForNow,
    handleIgnoreRule: ignoreRule,
    handleUnignoreRule: unignoreRule,
    reviewSession,
  };
}
