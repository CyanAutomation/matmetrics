'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { PluginConfirmationDialog } from '@/components/plugins/plugin-confirmation';
import { PluginDestructiveAction } from '@/components/plugins/plugin-destructive-action';
import { PluginBulkActions } from '@/components/plugins/plugin-bulk-actions';
import {
  PluginDataSurfaceFilterRow,
  PluginDataSurfaceSummaryStrip,
  PluginEmptyFilteredResults,
} from '@/components/plugins/plugin-data-surface';
import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
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
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import { getPluginUiTokenClassNames } from '@/components/plugins/plugin-style-policy';
import { PluginTabs } from '@/components/plugins/plugin-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Stethoscope } from 'lucide-react';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { useAuditStateManager } from '../hooks/use-audit-state-manager';
import { useFileValidationController } from '../hooks/use-file-validation-controller';
import { DrLogImage } from './drlog-image';
import { getSessions } from '@/lib/storage';
import {
  getSessionAudit,
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
} from '@/lib/types';
import { createDomSafePathId } from './dom-safe-id';
import { AuditResults } from './log-doctor-audit-results';
import { AuditReviewDialog } from './log-doctor-review-dialog';
import { AuditSettings } from './log-doctor-audit-settings';
import { LogDoctorStatusAlerts } from './log-doctor-status-alerts';

import {
  resolveResetDiagnosticsSnapshot,
  type AuditSessionResult,
  type DiagnosticsSnapshot,
} from './log-doctor-state';

type LogDoctorDestructiveAction = 'apply-fixes' | 'reset-diagnostics-state';
type LogDoctorDestructiveStage = 'opened' | 'confirmed' | 'canceled' | 'undone';
type AuditStep = 'run-check' | 'review-findings' | 'resolve-findings';

export const emitDestructiveActionEvent = (
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

export const LogDoctor = (): React.ReactElement => {
  const { preferences, user } = useAuth();
  const { toast } = useToast();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');

  // File validation state and controllers
  const fileValidation = useFileValidationController({
    owner,
    repo,
    branch,
  });
  const {
    scanResult,
    fixResult,
    isScanning,
    isPreviewing,
    isApplying,
    errorMessage,
    uiState,
  } = fileValidation;

  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [fileSearch, setFileSearch] = useState('');

  // Audit state management
  const [activeTab, setActiveTab] = useState<'validation' | 'audit'>(
    'validation'
  );
  const handleTabChange = React.useCallback((tabId: string) => {
    if (tabId === 'validation' || tabId === 'audit') {
      setActiveTab(tabId);
    }
  }, []);

  const {
    feedbackState: auditFeedbackState,
    startLoading: startAuditLoading,
    showSuccess: showAuditSuccess,
  } = useActionFeedback();

  const [auditConfig, setAuditConfig] = useState(getAuditConfig());
  const [auditMode, setAuditMode] = useState<AuditMode>(getAuditMode());
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [auditRanAt, setAuditRanAt] = useState<string | null>(null);
  const [auditStep, setAuditStep] = useState<AuditStep>('run-check');

  // Initialize audit results from persisted state
  const [initialAuditResults, setInitialAuditResults] = useState<AuditSessionResult[]>(() => {
    const lastRun = getLastAuditRun();
    if (lastRun) {
      const results: AuditSessionResult[] = lastRun.sessions.map((session) => ({
        ...session,
        reviewedAt: undefined,
        ignoredRules: [],
      }));
      setAuditRanAt(lastRun.ranAt);
      setAuditStep('review-findings');
      return results;
    }
    return [];
  });

  const {
    auditResults,
    setAuditResults,
    markResolved,
    dismissForNow,
    ignoreRule,
    unignoreRule,
  } = useAuditStateManager(user?.uid ?? null, initialAuditResults);

  useEffect(() => {
    const config = preferences.gitHub.config;
    if (!config) return;

    setOwner(config.owner);
    setRepo(config.repo);
    setBranch(config.branch ?? '');
  }, [preferences.gitHub.config]);

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
  }, [user?.uid, auditConfig, startAuditLoading, showAuditSuccess, setAuditResults, setAuditRanAt, setAuditStep]);

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
    try {
      await markResolved(sessionId);
      const existing = auditResults.find((r) => r.sessionId === sessionId);
      if (existing) {
        toast({
          title: 'Marked fixed',
          description: `Session from ${existing.sessionDate} is marked as fixed.`,
        });
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark session as fixed.',
      });
    }
  };

  const handleDismissForNow = async (sessionId: string): Promise<void> => {
    try {
      await dismissForNow(sessionId);
      const existing = auditResults.find((r) => r.sessionId === sessionId);
      if (existing) {
        toast({
          title: 'Dismissed for now',
          description: `All checks for ${existing.sessionDate} are dismissed for now.`,
        });
      }
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
    try {
      await ignoreRule(sessionId, code);
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
    try {
      await unignoreRule(sessionId, code);
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
    try {
      await fileValidation.scanFiles();
    } catch (error) {
      console.error('Failed to scan files:', error);
    }
  };

  const handlePreviewFixes = async (): Promise<void> => {
    if (selectedPaths.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Select at least one file before previewing fixes.',
      });
      return;
    }

    try {
      await fileValidation.previewFixes(selectedPaths);
    } catch (error) {
      console.error('Failed to preview fixes:', error);
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
    if (selectedPaths.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Select at least one file before applying fixes.',
      });
      return;
    }

    emitDestructiveActionEvent('apply-fixes', 'confirmed', {
      selectedCount,
      branch: branch.trim() || 'default branch',
    });
    setShowApplyConfirmation(false);

    try {
      await fileValidation.applyFixes(selectedPaths);
    } catch (error) {
      console.error('Failed to apply fixes:', error);
    }
  };

  const handleCancelActiveOperation = (): void => {
    fileValidation.cancelOperation();
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

    // Reset via the controller
    fileValidation.reset();

    // Update selected paths
    setSelectedPaths(resolved.next.selectedPaths);

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
            // Undo is not fully supported with the hook, but we can at least restore selected paths
            setSelectedPaths(resolved.previous?.selectedPaths ?? []);
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
      icon={<Stethoscope className="h-6 w-6" />}
      className="max-w-4xl"
    >
      <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-start">
        <div className="hidden shrink-0 lg:flex">
          <DrLogImage
            pose={1}
            size="medium"
            alt="Dr. Log in diagnostic mode, ready to scan and fix your session logs"
          />
        </div>

        <div className="w-full flex-1 space-y-4">
          {/* Tab switcher */}
          <PluginTabs
            tabs={[
              { id: 'validation', label: 'File Validation' },
              {
                id: 'audit',
                label: 'Session Audit',
                badge:
                  auditNeedsAttentionCount > 0 ? (
                    <Badge variant="destructive" className="ml-1">
                      {auditNeedsAttentionCount}
                    </Badge>
                  ) : undefined,
              },
            ]}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />

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
                  isDisabled={selectedCount === 0}
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
                  <PluginDataSurfaceFilterRow className="lg:grid-cols-1">
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
                  </PluginDataSurfaceFilterRow>
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleScan}
                        >
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
                    <div
                      key={`fix-${file.path}`}
                      className="rounded-md border p-3"
                    >
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
                        className={`max-h-56 overflow-auto rounded p-2 font-mono text-xs ${getPluginUiTokenClassNames('surface.diff-preview')}`}
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
              <PluginSectionCard
                title="Session audit status"
                contentClassName="flex flex-wrap items-center justify-between gap-3"
              >
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
              </PluginSectionCard>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={auditStep === 'run-check' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAuditStep('run-check')}
                >
                  1. Run check
                </Button>
                <Button
                  variant={
                    auditStep === 'review-findings' ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => setAuditStep('review-findings')}
                  disabled={!auditRanAt}
                >
                  2. Review findings
                </Button>
                <Button
                  variant={
                    auditStep === 'resolve-findings' ? 'default' : 'outline'
                  }
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
                          (s) =>
                            typeof s.duration === 'number' && s.duration > 0
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
                    className={`border-dashed ${getPluginUiTokenClassNames('surface.log-doctor')}`}
                  />
                ) : (
                  <PluginStatusPanel
                    variant="warning"
                    title="Haven't run an audit yet"
                    description='Click "Run check" above to get started.'
                    className={`border-dashed ${getPluginUiTokenClassNames('surface.log-doctor')}`}
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
                This will commit normalization fixes for {selectedCount}{' '}
                selected file(s) on{' '}
                <strong>{branch.trim() || 'the default branch'}</strong>. Undo
                is not available in Log Doctor.
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
        </div>
      </div>
    </PluginPageShell>
  );
};
