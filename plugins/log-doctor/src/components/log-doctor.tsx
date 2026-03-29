'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { getAuthHeaders } from '@/lib/auth-session';
import { DrLogImage } from '@/components/drlog-image';
import { getSessions } from '@/lib/storage';
import {
  getSessionAudit,
  saveSessionAudit,
  getAuditConfig,
  getLastAuditRun,
  saveLastAuditRun,
  saveAuditConfig,
} from '@/lib/user-preferences';
import {
  runAuditRulesForAllSessions,
} from '../lib/audit-rules';
import type { AuditConfig, AuditFlagCode, AuditRunResult, JudoSession, SessionAudit } from '@/lib/types';
import { createDomSafePathId } from './dom-safe-id';
import { AuditResults } from './log-doctor-audit-results';
import { AuditReviewDialog } from './log-doctor-review-dialog';
import { AuditSettings } from './log-doctor-audit-settings';
import { LogDoctorStatusAlerts } from './log-doctor-status-alerts';

import {
  canConfirmApplyFixes,
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
  const [applyConfirmationValue, setApplyConfirmationValue] = useState('');
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

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
  const [auditResults, setAuditResults] = useState<AuditSessionResult[]>([]);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [auditRanAt, setAuditRanAt] = useState<string | null>(null);

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
      showAuditSuccess();
    } finally {
    }
  }, [user?.uid, auditConfig, startAuditLoading, showAuditSuccess]);

  const handleReviewSession = (sessionId: string): void => {
    setReviewSessionId(sessionId);
  };

  const handleCloseReview = (): void => {
    setReviewSessionId(null);
  };

  const handleUpdateAuditConfig = async (newConfig: typeof auditConfig): Promise<void> => {
    if (!user?.uid) return;
    await saveAuditConfig(user.uid, newConfig);
    setAuditConfig(newConfig);
  };

  const handleMarkReviewed = async (sessionId: string): Promise<void> => {
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
        prev.map((r) => (r.sessionId === sessionId ? { ...r, reviewedAt: now } : r))
      );
      toast({
        title: 'Marked as reviewed',
        description: `Session from ${existing.sessionDate} has been reviewed.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark session as reviewed.',
      });
    }
  };

  const handleClearReview = async (sessionId: string): Promise<void> => {
    if (!user?.uid) return;
    const existing = auditResults.find((r) => r.sessionId === sessionId);
    if (!existing) return;

    const audit: SessionAudit = {
      sessionId,
      flags: existing.flags,
      reviewedAt: undefined,
      ignoredRules: existing.ignoredRules,
    };

    try {
      await saveSessionAudit(user.uid, sessionId, audit);
      setAuditResults((prev) =>
        prev.map((r) =>
          r.sessionId === sessionId ? { ...r, reviewedAt: undefined } : r
        )
      );
      toast({
        title: 'Review cleared',
        description: `Session from ${existing.sessionDate} review has been cleared.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to clear review.',
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
        title: 'Rule ignored',
        description: 'This rule will no longer flag this session.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to ignore rule.',
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
        title: 'Rule unignored',
        description: 'This rule will now flag this session again.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to unignore rule.',
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
    setApplyConfirmationValue('');
    setShowApplyConfirmation(true);
    emitDestructiveActionEvent('apply-fixes', 'opened', {
      selectedCount,
      branch: branch.trim() || 'default branch',
    });
  };

  const handleCancelApplyConfirmation = (): void => {
    setShowApplyConfirmation(false);
    setApplyConfirmationValue('');
    emitDestructiveActionEvent('apply-fixes', 'canceled', {
      selectedCount,
    });
  };

  const handleConfirmApplyFixes = async (): Promise<void> => {
    if (!canConfirmApplyFixes(applyConfirmationValue)) {
      setErrorMessage('Type APPLY to confirm this irreversible action.');
      return;
    }

    emitDestructiveActionEvent('apply-fixes', 'confirmed', {
      selectedCount,
      branch: branch.trim() || 'default branch',
    });
    setShowApplyConfirmation(false);
    setApplyConfirmationValue('');
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

  const reviewSession = auditResults.find(
    (r) => r.sessionId === reviewSessionId
  ) ?? null;

  const auditNeedsAttentionCount = auditResults.filter(
    (r) =>
      !r.reviewedAt && r.flags.some((f) => !r.ignoredRules.includes(f.code))
  ).length;

  const isBusy = isScanning || isPreviewing || isApplying;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-start gap-6">
        <div className="hidden lg:flex shrink-0">
          <DrLogImage pose={1} size="large" />
        </div>
        <div className="flex-1 space-y-2">
          <h2 className="text-lg font-semibold">Log Doctor</h2>
          <p className="text-sm text-muted-foreground">
            Scan, preview, and optionally apply markdown normalization fixes.
            Use Session Audit to detect data quality issues.
          </p>
        </div>
      </div>

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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Repository target</CardTitle>
            </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
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
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleScan} disabled={isScanning || !owner || !repo}>
          {isScanning ? 'Scanning…' : 'Scan repository'}
        </Button>
        <Button
          variant="secondary"
          onClick={handlePreviewFixes}
          disabled={isPreviewing || selectedCount === 0}
        >
          {isPreviewing ? 'Previewing…' : 'Preview fixes'}
        </Button>
        <Button
          variant="destructive"
          onClick={handleApplyFixes}
          disabled={isApplying || selectedCount === 0}
          aria-label={`Apply normalization fixes to ${selectedCount} selected files`}
        >
          {isApplying ? 'Applying…' : 'Apply fixes'}
        </Button>
        {isBusy ? (
          <Button variant="outline" onClick={handleCancelActiveOperation}>
            Cancel current check
          </Button>
        ) : null}
      </div>

      <LogDoctorStatusAlerts
        uiState={uiState}
        errorMessage={errorMessage}
        onRetry={handleScan}
      />

      {scanResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scan results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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

            {invalidFiles.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
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
            ) : (
              <div className="space-y-2">
                {invalidFiles.map((file) => {
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
                        <ul className="list-disc pl-5 text-destructive">
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
          </CardContent>
        </Card>
      ) : null}

      {fixResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Fix result ({fixResult.mode})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{fixResult.message}</p>
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
                  <p className="mb-2 text-xs text-muted-foreground">
                    {file.message}
                  </p>
                ) : null}
                {file.validationState.errors?.length ? (
                  <ul className="mb-2 list-disc pl-5 text-xs text-destructive">
                    {file.validationState.errors.map((entry) => (
                      <li key={`${file.path}-err-${entry}`}>{entry}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mb-2 text-xs text-muted-foreground">
                  Validation: {file.validationState.before} →{' '}
                  {file.validationState.after}
                  {file.commitSha ? ` · commit ${file.commitSha}` : ''}
                </div>
                <div className="max-h-56 overflow-auto rounded border bg-muted p-2 font-mono text-xs">
                  <pre className="whitespace-pre-wrap break-words">
                    {file.preview.diff}
                  </pre>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
        </> /* end File Validation tab */
      ) : null}

      {/* Session Audit Tab */}
      {activeTab === 'audit' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleRunAudit}
              disabled={auditFeedbackState === 'loading'}
              aria-label="Run session audit checks"
            >
              {auditFeedbackState === 'loading'
                ? 'Running audit…'
                : auditFeedbackState === 'success'
                  ? 'Audit complete ✓'
                  : 'Run audit'}
            </Button>
            {auditRanAt ? (
              <span className="text-xs text-muted-foreground">
                Last run: {new Date(auditRanAt).toLocaleTimeString()}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Click &quot;Run audit&quot; to check your sessions for data
                quality issues.
              </span>
            )}
          </div>

          <AuditSettings
            config={auditConfig}
            sessionCount={getSessions().filter((s) => typeof s.duration === 'number' && s.duration > 0).length}
            onConfigChange={handleUpdateAuditConfig}
          />

          {auditResults.length > 0 ? (
            <AuditResults
              results={auditResults}
              onReview={handleReviewSession}
            />
          ) : auditRanAt ? (
            <Card className="border border-dashed border-ghost bg-secondary/20">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DrLogImage pose={1} size="medium" alt="No issues found" />
                <p className="mt-3 text-center text-muted-foreground">
                  All sessions passed quality checks!
                </p>
                <p className="mt-1 text-center text-sm text-muted-foreground">
                  No issues detected.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-dashed border-ghost bg-secondary/20">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DrLogImage pose={2} size="medium" alt="No audit run yet" />
                <p className="mt-3 text-center text-muted-foreground">
                  Haven't run an audit yet
                </p>
                <p className="mt-1 text-center text-sm text-muted-foreground">
                  Click &quot;Run audit&quot; above to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <AuditReviewDialog
        session={reviewSession}
        open={reviewSessionId !== null}
        onClose={handleCloseReview}
        onMarkReviewed={(id) => {
          void handleMarkReviewed(id);
        }}
        onIgnoreRule={(id, code) => {
          void handleIgnoreRule(id, code);
        }}
        onUnignoreRule={(id, code) => {
          void handleUnignoreRule(id, code);
        }}
        onClearReview={(id) => {
          void handleClearReview(id);
        }}
      />

      <Dialog
        open={showApplyConfirmation}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelApplyConfirmation();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Confirm apply fixes
            </DialogTitle>
            <DialogDescription>
              This will commit normalization fixes for {selectedCount} selected
              file(s) on{' '}
              <strong>{branch.trim() || 'the default branch'}</strong>. Undo is
              not available in Log Doctor. Type <strong>APPLY</strong> to
              continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="apply-fixes-confirm-text">Confirmation text</Label>
            <Input
              id="apply-fixes-confirm-text"
              value={applyConfirmationValue}
              onChange={(event) =>
                setApplyConfirmationValue(event.target.value)
              }
              placeholder="Type APPLY"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelApplyConfirmation}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleConfirmApplyFixes();
              }}
              aria-label="Confirm apply fixes and create commits"
              disabled={!canConfirmApplyFixes(applyConfirmationValue)}
            >
              Confirm apply fixes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showResetConfirmation}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelResetConfirmation();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Reset diagnostics state?
            </DialogTitle>
            <DialogDescription>
              This clears current scan findings, fix previews, and selected
              files from the Log Doctor panel. You can undo this reset from the
              toast after confirming.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelResetConfirmation}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmResetDiagnosticsState}
              aria-label="Confirm resetting diagnostics state"
            >
              Reset diagnostics state
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
