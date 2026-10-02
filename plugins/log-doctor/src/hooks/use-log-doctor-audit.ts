'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { getAuthHeaders } from '@/lib/auth-session';
import {
  isSessionAssessment,
  type SessionAssessmentInput,
} from '@/lib/jev-client';
import {
  getAuditConfig,
  getAuditMode,
  getLastAuditRun,
  getSessionAudit,
  saveAuditConfig,
  saveLastAuditRun,
} from '@/lib/user-preferences';
import { getSessions } from '@/lib/storage';
import { runSessionAudit } from '../lib/run-session-audit';
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
  semanticAudit: AuditRunResult['semanticAudit'];
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
  handleRunAudit: () => Promise<void>;
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
  const { user, canUseAi } = useAuth();
  const {
    feedbackState: auditFeedbackState,
    startLoading,
    showSuccess,
    showError,
  } = useActionFeedback();
  const [activeTab, setActiveTab] = useState<'validation' | 'audit'>(
    'validation'
  );
  const [auditConfig, setAuditConfig] = useState(getAuditConfig());
  const [auditMode, setAuditMode] = useState<AuditMode>(getAuditMode());
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [auditRanAt, setAuditRanAt] = useState<string | null>(null);
  const [semanticAudit, setSemanticAudit] = useState<
    AuditRunResult['semanticAudit']
  >();
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
    setSemanticAudit(lastRun.semanticAudit);
    setAuditStep('review-findings');
  }, [setAuditResults]);

  const handleTabChange = useCallback((tabId: string): void => {
    if (tabId === 'validation' || tabId === 'audit') setActiveTab(tabId);
  }, []);

  const handleRunAudit = useCallback(async (): Promise<void> => {
    startLoading();
    try {
      const requestAssessment = canUseAi
        ? async (input: SessionAssessmentInput) => {
            const response = await fetch('/api/ai/assess-session', {
              method: 'POST',
              headers: await getAuthHeaders({
                'Content-Type': 'application/json',
              }),
              body: JSON.stringify(input),
            });
            const payload: unknown = await response.json();
            const assessment =
              payload && typeof payload === 'object'
                ? (payload as { assessment?: unknown }).assessment
                : undefined;

            if (!response.ok || !isSessionAssessment(assessment)) {
              throw new Error('Session assessment is unavailable');
            }
            return assessment;
          }
        : undefined;
      const rawRun = await runSessionAudit(
        getSessions(),
        auditConfig,
        requestAssessment
      );
      const merged: AuditSessionResult[] = rawRun.sessions.map((result) => {
        const persisted = getSessionAudit(result.sessionId);
        return {
          ...result,
          reviewedAt: persisted?.reviewedAt,
          ignoredRules: persisted?.ignoredRules ?? [],
        };
      });
      const runResult: AuditRunResult = {
        ...rawRun,
        sessions: merged,
        ranAt: new Date().toISOString(),
      };

      if (user?.uid) {
        saveLastAuditRun(user.uid, runResult).catch((error) => {
          console.error('Failed to save audit result:', error);
        });
      }
      setAuditResults(merged);
      setAuditRanAt(runResult.ranAt);
      setSemanticAudit(runResult.semanticAudit);
      setAuditStep('review-findings');
      showSuccess();
    } catch {
      showError();
    }
  }, [
    auditConfig,
    canUseAi,
    setAuditResults,
    showError,
    showSuccess,
    startLoading,
    user,
  ]);

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
    semanticAudit,
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
