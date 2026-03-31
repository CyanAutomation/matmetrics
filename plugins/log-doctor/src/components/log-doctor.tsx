'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';
import { PluginBulkActions } from '@/components/plugins/plugin-bulk-actions';
import {
  PluginDataSurfaceSummaryStrip,
  PluginEmptyFilteredResults,
} from '@/components/plugins/plugin-data-surface';
import {
  PluginStatusPanel,
  PluginTableSection,
} from '@/components/plugins/plugin-kit';
import {
  PluginActionDestructive,
  PluginActionPrimary,
  PluginActionRow,
  PluginActionSecondary,
} from '@/components/plugins/plugin-action-row';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import { PluginFilterBar } from '@/components/plugins/plugin-filter-bar';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { getAuthHeaders } from '@/lib/auth-session';
import { DrLogImage } from './drlog-image';
import { getSessions } from '@/lib/storage';
import {
  getSessionAudit,
  saveSessionAudit,
  getAuditConfig,
  getAuditMode,
  getLastAuditRun,
  saveLastAuditRun,
  saveAuditConfig,
} from '@/lib/user-preferences';
import { runAuditRulesForAllSessions } from '../lib/audit-rules';
import type {
  AuditFlagCode,
  AuditMode,
  AuditRunResult,
  JudoSession,
  SessionAudit,
} from '@/lib/types';
import { createDomSafePathId } from './dom-safe-id';
import { AuditResults } from './log-doctor-audit-results';
import { AuditReviewDialog } from './log-doctor-review-dialog';
import { AuditSettings } from './log-doctor-audit-settings';
import { LogDoctorStatusAlerts } from './log-doctor-status-alerts';

import {
  createEmptyDiagnosticsSnapshot,
  createUiState,
  resolveResetDiagnosticsSnapshot,
  type AuditSessionResult,
  type DiagnosticsSnapshot,
  type FixResult,
  type LogDoctorUiState,
  type ScanResult,
} from './log-doctor-state';

type LogDoctorDestructiveAction = 'apply-fixes' | 'reset-diagnostics-state';
type LogDoctorDestructiveStage = 'opened' | 'confirmed' | 'canceled' | 'undone';
type AuditStep = 'run-check' | 'review-findings' | 'resolve-findings';

const emitDestructiveActionEvent = (
  action: LogDoctorDestructiveAction,
  stage: LogDoctorDestructiveStage,
  metadata?: Record<string, string | number | boolean>
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('logDoctorDestructiveAction', {
      detail: {
        action,
        stage,
        metadata: metadata ?? {},
      },
    })
  );
};

const ABORTED_REQUEST_REASON = 'Request canceled';
const EMPTY_DIAGNOSTICS_SNAPSHOT = createEmptyDiagnosticsSnapshot();

export const toErrorReason = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return ABORTED_REQUEST_REASON;
  }

  if (
    typeof error === 'object' &&
    error &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  ) {
    return ABORTED_REQUEST_REASON;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return 'Unexpected response from the service.';
};

const isJsonContentType = (contentType: string | null): boolean => {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/json') || normalized.includes('+json')
  );
};

const getRouteHint = (response: Response): string => {
  try {
    if (!response.url) {
      return 'unknown route';
    }
    const parsed = new URL(response.url);
    return parsed.pathname || response.url;
  } catch {
    return response.url || 'unknown route';
  }
};

export const parseApiResponse = async <T,>(response: Response): Promise<T> => {
  const statusLabel = `HTTP ${response.status}`;
  const routeHint = getRouteHint(response);
  const contentType = response.headers.get('content-type');

  if (isJsonContentType(contentType)) {
    let payload: T;
    try {
      payload = (await response.json()) as T;
    } catch {
      throw new Error(`Service returned malformed JSON (${statusLabel}).`);
    }

    if (!response.ok) {
      const maybeMessage =
        payload && typeof payload === 'object' && 'message' in payload
          ? String(
              (payload as { message?: unknown }).message ?? 'Request failed'
            )
          : `Request failed (${statusLabel})`;
      throw new Error(maybeMessage);
    }

    return payload;
  }

  const rawText = (await response.text()).trim();
  const bodyHint = rawText
    ? ` Response body: ${rawText.slice(0, 160)}${rawText.length > 160 ? '…' : ''}`
    : '';
  throw new Error(
    `Service returned non-JSON response (${statusLabel}) from ${routeHint}.${bodyHint}`
  );
};

export const LogDoctor = (): React.ReactElement => {
  const { preferences, user } = useAuth();
  const { toast } = useToast();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uiState, setUiState] = useState<LogDoctorUiState>(
    EMPTY_DIAGNOSTICS_SNAPSHOT.uiState
  );

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [activeController, setActiveController] =
    useState<AbortController | null>(null);
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [fileSearch, setFileSearch] = useState('');

  // Audit tab state
  const [activeTab, setActiveTab] = useState<'validation' | 'audit'>(
    'validation'
  );
  const {
    feedbackState: auditFeedbackState,
    startLoading: startAuditLoading,
    showSuccess: showAuditSuccess,
  } = useActionFeedback();
  const [auditConfig, setAuditConfig] = useState(getAuditConfig());
  const [auditMode, setAuditMode] = useState<AuditMode>(getAuditMode());
  const [auditResults, setAuditResults] = useState<AuditSessionResult[]>([]);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [auditRanAt, setAuditRanAt] = useState<string | null>(null);
  const [auditStep, setAuditStep] = useState<AuditStep>('run-check');

  useEffect(() => {
    const config = preferences.gitHub.config;
    if (!config) return;

    setOwner(config.owner);
    setRepo(config.repo);
    setBranch(config.branch ?? '');
  }, [preferences.gitHub.config]);

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

  const invalidFiles = useMemo(
    () => scanResult?.files.filter((file) => file.status === 'invalid') ?? [],
    [scanResult]
  );
  const invalidFileSelectIds = useMemo(
    () =>
      invalidFiles.map((file, rowIndex) => ({
        path: file.path,
        selectId: createDomSafePathId(file.path, rowIndex),
      })),
    [invalidFiles]
  );
  const selectIdByPath = useMemo(
    () =>
      new Map(
        invalidFileSelectIds.map(
          (entry) => [entry.path, entry.selectId] as const
        )
      ),
    [invalidFileSelectIds]
  );

  const selectedCount = selectedPaths.length;
  const filteredInvalidFiles = useMemo(() => {
    const normalizedSearch = fileSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return invalidFiles;
    }
    return invalidFiles.filter((file) =>
      file.path.toLowerCase().includes(normalizedSearch)
    );
  }, [fileSearch, invalidFiles]);

  const togglePath = (path: string): void => {
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path]
    );
  };

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

  const handleReviewSession = (sessionId: string): void => {
    setAuditStep('resolve-findings');
    setReviewSessionId(sessionId);
  };

  const handleCloseReview = (): void => {
    setReviewSessionId(null);
  };

  const handleUpdateAuditConfig = async (
    newConfig: typeof auditConfig,
    mode: AuditMode
  ): Promise<void> => {
    if (!user?.uid) return;
    await saveAuditConfig(user.uid, newConfig, mode);
    setAuditMode(mode);
    setAuditConfig(newConfig);
  };

  const handleMarkResolved = async (sessionId: string): Promise<void> => {
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
  };

  const handleDismissForNow = async (sessionId: string): Promise<void> => {
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
  };

  const handleIgnoreRule = async (
    sessionId: string,
    code: AuditFlagCode
  ): Promise<void> => {
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
  };

  const handleUnignoreRule = async (
    sessionId: string,
    code: AuditFlagCode
  ): Promise<void> => {
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
  };

  const handleScan = async (): Promise<void> => {
    setErrorMessage(null);
    setFixResult(null);
    setIsScanning(true);
    setUiState(createUiState('scan', 'loading'));
    const controller = new AbortController();
    setActiveController(controller);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/log-doctor', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim() || undefined,
        }),
      });

      const payload = await parseApiResponse<ScanResult>(response);
      setScanResult(payload);
      const defaults = payload.files
        .filter((file) => file.status === 'invalid')
        .map((file) => file.path);
      setSelectedPaths(defaults);
      setUiState(
        payload.summary.totalFiles === 0
          ? createUiState('scan', 'empty', { hasLogs: false })
          : createUiState('scan', 'success')
      );
    } catch (error) {
      const reason = toErrorReason(error);
      setErrorMessage(createUiState('scan', 'error', { reason }).message);
      setUiState(createUiState('scan', 'error', { reason }));
    } finally {
      setActiveController(null);
      setIsScanning(false);
    }
  };

  const handlePreviewFixes = async (): Promise<void> => {
    if (selectedPaths.length === 0) {
      setErrorMessage('Select at least one file before previewing fixes.');
      return;
    }

    setErrorMessage(null);
    setIsPreviewing(true);
    setUiState(createUiState('preview', 'loading'));
    const controller = new AbortController();
    setActiveController(controller);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/log-doctor/fix', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim() || undefined,
          mode: 'dry-run',
          confirmApply: false,
          paths: selectedPaths,
          options: {
            normalizeFrontmatter: true,
            enforceSectionOrder: true,
            preserveUserContent: true,
          },
        }),
      });

      const payload = await parseApiResponse<FixResult>(response);
      setFixResult(payload);
      setUiState(
        payload.files.length === 0
          ? createUiState('preview', 'empty', { hasFindings: false })
          : createUiState('preview', 'success')
      );
    } catch (error) {
      const reason = toErrorReason(error);
      setErrorMessage(createUiState('preview', 'error', { reason }).message);
      setUiState(createUiState('preview', 'error', { reason }));
    } finally {
      setActiveController(null);
      setIsPreviewing(false);
    }
  };

  const executeApplyFixes = async (): Promise<void> => {
    if (selectedPaths.length === 0) {
      setErrorMessage('Select at least one file before applying fixes.');
      return;
    }

    setErrorMessage(null);
    setIsApplying(true);
    setUiState(createUiState('apply', 'loading'));
    const controller = new AbortController();
    setActiveController(controller);
    try {
      const headers = await getAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/github/log-doctor/fix', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim() || undefined,
          mode: 'apply',
          confirmApply: true,
          paths: selectedPaths,
          options: {
            normalizeFrontmatter: true,
            enforceSectionOrder: true,
            preserveUserContent: true,
          },
        }),
      });

      const payload = await parseApiResponse<FixResult>(response);
      setFixResult(payload);
      setUiState(
        payload.files.length === 0
          ? createUiState('apply', 'empty', { hasFindings: false })
          : createUiState('apply', 'success')
      );
    } catch (error) {
      const reason = toErrorReason(error);
      setErrorMessage(createUiState('apply', 'error', { reason }).message);
      setUiState(createUiState('apply', 'error', { reason }));
    } finally {
      setActiveController(null);
      setIsApplying(false);
    }
  };

  const handleApplyFixes = (): void => {
    setShowApplyConfirmation(true);
    emitDestructiveActionEvent('apply-fixes', 'opened', {
      selectedCount,
      branch: branch.trim() || 'default branch',
    });
  };

  const handleCancelApplyConfirmation = (): void => {
    setShowApplyConfirmation(false);
    emitDestructiveActionEvent('apply-fixes', 'canceled', {
      selectedCount,
    });
  };

  const handleConfirmApplyFixes = async (): Promise<void> => {
    emitDestructiveActionEvent('apply-fixes', 'confirmed', {
      selectedCount,
      branch: branch.trim() || 'default branch',
    });
    setShowApplyConfirmation(false);
    await executeApplyFixes();
  };

  const handleCancelActiveOperation = (): void => {
    activeController?.abort();
  };

  const handleResetDiagnosticsState = (): void => {
    setShowResetConfirmation(true);
    emitDestructiveActionEvent('reset-diagnostics-state', 'opened');
  };

  const handleCancelResetConfirmation = (): void => {
    setShowResetConfirmation(false);
    emitDestructiveActionEvent('reset-diagnostics-state', 'canceled');
  };

  const handleConfirmResetDiagnosticsState = (): void => {
    const currentSnapshot: DiagnosticsSnapshot = {
      scanResult,
      fixResult,
      selectedPaths,
      uiState,
      errorMessage,
      auditResult: null,
    };
    const resolved = resolveResetDiagnosticsSnapshot(currentSnapshot, true);
    setShowResetConfirmation(false);
    setScanResult(resolved.next.scanResult);
    setFixResult(resolved.next.fixResult);
    setSelectedPaths(resolved.next.selectedPaths);
    setUiState(resolved.next.uiState);
    setErrorMessage(resolved.next.errorMessage);
    emitDestructiveActionEvent('reset-diagnostics-state', 'confirmed');

    if (!resolved.previous) {
      return;
    }

    toast({
      title: 'Diagnostics state reset',
      description: 'Cleared current scan and fix results. Undo is available.',
      action: (
        <ToastAction
          altText="Undo reset diagnostics state"
          onClick={() => {
            setScanResult(resolved.previous?.scanResult ?? null);
            setFixResult(resolved.previous?.fixResult ?? null);
            setSelectedPaths(resolved.previous?.selectedPaths ?? []);
            setUiState(
              resolved.previous?.uiState ?? EMPTY_DIAGNOSTICS_SNAPSHOT.uiState
            );
            setErrorMessage(resolved.previous?.errorMessage ?? null);
            emitDestructiveActionEvent('reset-diagnostics-state', 'undone');
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const reviewSession =
    auditResults.find((r) => r.sessionId === reviewSessionId) ?? null;

  const auditNeedsAttentionCount = auditResults.filter(
    (r) =>
      !r.reviewedAt && r.flags.some((f) => !r.ignoredRules.includes(f.code))
  ).length;

  const isBusy = isScanning || isPreviewing || isApplying;
  const firstSessionNeedingAttention = auditResults.find(
    (r) =>
      !r.reviewedAt && r.flags.some((f) => !r.ignoredRules.includes(f.code))
  );

  const summaryAction = useMemo(() => {
    if (!auditRanAt) {
      return {
        label: 'Run check',
        onClick: handleRunAudit,
        disabled: auditFeedbackState === 'loading',
      };
    }

    if (auditNeedsAttentionCount > 0) {
      if (auditStep === 'resolve-findings' && firstSessionNeedingAttention) {
        return {
          label: 'Mark fixed',
          onClick: () =>
            handleReviewSession(firstSessionNeedingAttention.sessionId),
          disabled: false,
        };
      }
      return {
        label: 'Review findings',
        onClick: () => setAuditStep('review-findings'),
        disabled: false,
      };
    }

    return {
      label: 'Run check again',
      onClick: handleRunAudit,
      disabled: auditFeedbackState === 'loading',
    };
  }, [
    auditFeedbackState,
    auditNeedsAttentionCount,
    auditRanAt,
    auditStep,
    firstSessionNeedingAttention,
    handleRunAudit,
  ]);

  return (
    <PluginPageShell
      title="Log Doctor"
      description="Scan, preview, and optionally apply markdown normalization fixes. Use Session Audit to detect data quality issues."
      icon={
        <div className="hidden shrink-0 lg:flex">
          <DrLogImage pose={1} size="large" />
        </div>
      }
      tone="default"
      iconFrame="none"
      contentClassName="space-y-4"
    >
      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'validation' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('validation')}
          aria-pressed={activeTab === 'validation'}
        >
          File Validation
        </Button>
        <Button
          variant={activeTab === 'audit' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('audit')}
          aria-pressed={activeTab === 'audit'}
        >
          Session Audit
          {auditNeedsAttentionCount > 0 ? (
            <Badge variant="destructive" className="ml-2">
              {auditNeedsAttentionCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      {/* File Validation Tab */}
      {activeTab === 'validation' ? (
        <>
          <PluginSectionCard
            title={<span className="text-base">Repository target</span>}
            contentClassName="grid gap-3 md:grid-cols-3"
          >
            <div className="space-y-1">
              <Label htmlFor="log-doctor-owner">Owner</Label>
              <Input
                id="log-doctor-owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="log-doctor-repo">Repository</Label>
              <Input
                id="log-doctor-repo"
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="log-doctor-branch">Branch (optional)</Label>
              <Input
                id="log-doctor-branch"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              />
            </div>
          </PluginSectionCard>

          <PluginActionRow>
            <PluginBulkActions
              selectedCount={selectedCount}
              itemLabel="file"
              disabledMessage={
                selectedCount === 0
                  ? 'Select at least one invalid file to preview or apply fixes.'
                  : undefined
              }
            >
              <PluginActionPrimary>
                <Button
                  onClick={handleScan}
                  disabled={isScanning || !owner || !repo}
                >
                  {isScanning ? 'Scanning…' : 'Scan repository'}
                </Button>
              </PluginActionPrimary>
              <PluginActionSecondary>
                <Button
                  variant="secondary"
                  onClick={handlePreviewFixes}
                  disabled={isPreviewing || selectedCount === 0}
                >
                  {isPreviewing ? 'Previewing…' : 'Preview fixes'}
                </Button>
              </PluginActionSecondary>
              <PluginActionDestructive>
                <Button
                  variant="destructive"
                  onClick={handleApplyFixes}
                  disabled={isApplying || selectedCount === 0}
                  aria-label={`Apply normalization fixes to ${selectedCount} selected files`}
                >
                  {isApplying ? 'Applying…' : 'Apply fixes'}
                </Button>
              </PluginActionDestructive>
              {isBusy ? (
                <PluginActionSecondary>
                  <Button
                    variant="outline"
                    onClick={handleCancelActiveOperation}
                  >
                    Cancel current check
                  </Button>
                </PluginActionSecondary>
              ) : null}
            </PluginBulkActions>
          </PluginActionRow>

          <LogDoctorStatusAlerts
            uiState={uiState}
            errorMessage={errorMessage}
            onRetry={handleScan}
          />

          {scanResult ? (
            <PluginTableSection
              title="Scan results"
              hasRows
              emptyTitle="No scan results"
              emptyDescription="Run a scan to inspect repository diagnostics."
            >
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">
                  Total: {scanResult.summary.totalFiles}
                </Badge>
                <Badge variant="outline">
                  Valid: {scanResult.summary.validFiles}
                </Badge>
                <Badge variant="destructive">
                  Invalid: {scanResult.summary.invalidFiles}
                </Badge>
                <Badge variant="secondary">Selected: {selectedCount}</Badge>
              </div>
              <PluginFilterBar className="lg:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="log-doctor-file-search">
                    Search invalid file paths
                  </Label>
                  <Input
                    id="log-doctor-file-search"
                    value={fileSearch}
                    onChange={(event) => setFileSearch(event.target.value)}
                    placeholder="Filter by file path"
                  />
                </div>
              </PluginFilterBar>
              <PluginDataSurfaceSummaryStrip
                filteredCount={filteredInvalidFiles.length}
                totalCount={invalidFiles.length}
                itemLabel="invalid files"
                activeFilters={
                  fileSearch.trim()
                    ? [{ label: 'Search', value: fileSearch.trim() }]
                    : []
                }
              />

              {invalidFiles.length === 0 ? (
                <div className="space-y-2">
                  <p
                    className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
                  >
                    No invalid files found.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleScan}>
                      Refresh logs
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      aria-label="Reset diagnostics state and select a different source"
                      onClick={handleResetDiagnosticsState}
                    >
                      Select source
                    </Button>
                  </div>
                </div>
              ) : filteredInvalidFiles.length === 0 ? (
                <PluginEmptyFilteredResults
                  title="No invalid files match this search"
                  description="Adjust or clear the search to see available invalid files."
                  clearLabel="Clear search"
                  onClear={() => setFileSearch('')}
                />
              ) : (
                <div className="space-y-2">
                  {filteredInvalidFiles.map((file) => {
                    const selectId = selectIdByPath.get(file.path);
                    if (!selectId) return null;

                    return (
                      <div
                        key={file.path}
                        className="rounded-md border p-3 text-sm space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={selectId}
                              checked={selectedPaths.includes(file.path)}
                              onChange={() => togglePath(file.path)}
                            />
                            <Label
                              className="cursor-pointer break-all"
                              htmlFor={selectId}
                            >
                              {file.path}
                            </Label>
                          </div>
                          <Badge variant="destructive">invalid</Badge>
                        </div>
                        {(file.errors ?? []).length > 0 ? (
                          <ul
                            className={`list-disc pl-5 ${getPluginUiTokenClassNames('text.danger')}`}
                          >
                            {file.errors?.map((entry) => (
                              <li key={`${file.path}-${entry}`}>{entry}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </PluginTableSection>
          ) : null}

          {fixResult ? (
            <PluginTableSection
              title={`Fix result (${fixResult.mode})`}
              hasRows
              emptyTitle="No fix result"
              emptyDescription="Preview or apply fixes to view result details."
            >
              <p
                className={`text-sm ${getPluginUiTokenClassNames('text.subtle')}`}
              >
                {fixResult.message}
              </p>
              {fixResult.files.map((file) => (
                <div key={`fix-${file.path}`} className="rounded-md border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium break-all">
                      {file.path}
                    </span>
                    <Badge
                      variant={
                        file.status === 'error' ? 'destructive' : 'outline'
                      }
                    >
                      {file.status}
                    </Badge>
                  </div>
                  {file.message ? (
                    <p
                      className={`mb-2 text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
                    >
                      {file.message}
                    </p>
                  ) : null}
                  {file.validationState.errors?.length ? (
                    <ul
                      className={`mb-2 list-disc pl-5 text-xs ${getPluginUiTokenClassNames('text.danger')}`}
                    >
                      {file.validationState.errors.map((entry) => (
                        <li key={`${file.path}-err-${entry}`}>{entry}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div
                    className={`mb-2 text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
                  >
                    Validation: {file.validationState.before} →{' '}
                    {file.validationState.after}
                    {file.commitSha ? ` · commit ${file.commitSha}` : ''}
                  </div>
                  <div
                    className={`max-h-56 overflow-auto rounded p-2 font-mono text-xs ${getPluginUiTokenClassNames('surface.diffPreview')}`}
                  >
                    <pre className="whitespace-pre-wrap break-words">
                      {file.preview.diff}
                    </pre>
                  </div>
                </div>
              ))}
            </PluginTableSection>
          ) : null}
        </> /* end File Validation tab */
      ) : null}

      {/* Session Audit Tab */}
      {activeTab === 'audit' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session audit status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
              <div>
                <p className="text-sm font-medium">
                  {auditNeedsAttentionCount} session
                  {auditNeedsAttentionCount !== 1 ? 's' : ''} need attention
                </p>
                <p
                  className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
                >
                  {!auditRanAt
                    ? 'Run an audit check to detect quality issues.'
                    : 'Primary path: Run check → Review findings → Mark fixed.'}
                </p>
              </div>
              <Button
                onClick={summaryAction.onClick}
                disabled={summaryAction.disabled}
              >
                {summaryAction.label}
              </Button>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={auditStep === 'run-check' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAuditStep('run-check')}
            >
              1. Run check
            </Button>
            <Button
              variant={auditStep === 'review-findings' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAuditStep('review-findings')}
              disabled={!auditRanAt}
            >
              2. Review findings
            </Button>
            <Button
              variant={auditStep === 'resolve-findings' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAuditStep('resolve-findings')}
              disabled={!auditRanAt || auditResults.length === 0}
            >
              3. Mark fixed
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {auditStep === 'run-check' ? (
              <Button
                onClick={handleRunAudit}
                disabled={auditFeedbackState === 'loading'}
                aria-label="Run session audit checks"
              >
                {auditFeedbackState === 'loading'
                  ? 'Running audit…'
                  : auditFeedbackState === 'success'
                    ? 'Audit complete ✓'
                    : 'Run check'}
              </Button>
            ) : null}
            {auditStep === 'run-check' ? (
              <span
                className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
              >
                Recommended and safe: run with default settings first.
              </span>
            ) : null}
            {auditRanAt ? (
              <span
                className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
              >
                Last run: {new Date(auditRanAt).toLocaleTimeString()}
              </span>
            ) : (
              <span
                className={`text-xs ${getPluginUiTokenClassNames('text.subtle')}`}
              >
                Click &quot;Run check&quot; to check your sessions for data
                quality issues.
              </span>
            )}
          </div>

          {auditStep === 'run-check' ? (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Advanced
              </summary>
              <div className="mt-3">
                <AuditSettings
                  mode={auditMode}
                  config={auditConfig}
                  sessionCount={
                    getSessions().filter(
                      (s) => typeof s.duration === 'number' && s.duration > 0
                    ).length
                  }
                  onConfigChange={handleUpdateAuditConfig}
                />
              </div>
            </details>
          ) : null}

          {auditStep === 'review-findings' ||
          auditStep === 'resolve-findings' ? (
            auditResults.length > 0 ? (
              <AuditResults
                results={auditResults}
                onReview={handleReviewSession}
              />
            ) : auditRanAt ? (
              <PluginStatusPanel
                variant="success"
                title="All sessions passed quality checks!"
                description="No issues detected."
                className={`border-dashed ${getPluginUiTokenClassNames('surface.logDoctor')}`}
              />
            ) : (
              <PluginStatusPanel
                variant="warning"
                title="Haven't run an audit yet"
                description='Click "Run check" above to get started.'
                className={`border-dashed ${getPluginUiTokenClassNames('surface.logDoctor')}`}
              />
            )
          ) : null}
        </div>
      ) : null}

      {auditStep === 'resolve-findings' ? (
        <AuditReviewDialog
          session={reviewSession}
          open={reviewSessionId !== null}
          onClose={handleCloseReview}
          onMarkResolved={(id) => {
            void handleMarkResolved(id);
          }}
          onDismissForNow={(id) => {
            void handleDismissForNow(id);
          }}
          onIgnoreRule={(id, code) => {
            void handleIgnoreRule(id, code);
          }}
          onUnignoreRule={(id, code) => {
            void handleUnignoreRule(id, code);
          }}
        />
      ) : null}

      <PluginConfirmationDialog
        open={showApplyConfirmation}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelApplyConfirmation();
          }
        }}
        title="Confirm apply fixes"
        description={
          <>
            This will commit normalization fixes for {selectedCount} selected
            file(s) on <strong>{branch.trim() || 'the default branch'}</strong>.
            Undo is not available in Log Doctor.
          </>
        }
        confirmLabel="Confirm apply fixes"
        cancelLabel="Cancel"
        onCancel={handleCancelApplyConfirmation}
        onConfirm={() => {
          void handleConfirmApplyFixes();
        }}
        typedConfirmation={{
          requiredText: 'APPLY',
          inputLabel: 'Confirmation text',
          inputPlaceholder: 'Type APPLY',
          helperText: 'Type APPLY to confirm this irreversible action.',
        }}
      />

      <PluginDestructiveAction
        open={showResetConfirmation}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelResetConfirmation();
          }
        }}
        title="Reset diagnostics state?"
        description="This clears current scan findings, fix previews, and selected files from the Log Doctor panel. You can undo this reset from the toast after confirming."
        confirmLabel="Reset diagnostics state"
        cancelLabel="Cancel"
        onCancel={handleCancelResetConfirmation}
        onConfirm={handleConfirmResetDiagnosticsState}
      />
    </PluginPageShell>
  );
};
