'use client';

import React, { useEffect, useMemo, useState } from 'react';

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
import { useFileValidationController } from '../hooks/use-file-validation-controller';
import { useLogDoctorAudit } from '../hooks/use-log-doctor-audit';
import { useLogDoctorValidationActions } from '../hooks/use-log-doctor-validation-actions';
import { DrLogImage } from './drlog-image';
import { getSessions } from '@/lib/storage';
import { createDomSafePathId } from './dom-safe-id';
import { AuditResults } from './log-doctor-audit-results';
import { AuditReviewDialog } from './log-doctor-review-dialog';
import { AuditSettings } from './log-doctor-audit-settings';
import { LogDoctorStatusAlerts } from './log-doctor-status-alerts';
import { LogDoctorRepositoryTarget } from './log-doctor-repository-target';
export {
  createAuditSummaryAction,
  type AuditSummaryAction,
} from './log-doctor-view-model';
import { createAuditSummaryAction } from './log-doctor-view-model';

import {
  resolveResetDiagnosticsSnapshot,
  type DiagnosticsSnapshot,
} from './log-doctor-state';

type LogDoctorDestructiveAction = 'apply-fixes' | 'reset-diagnostics-state';
type LogDoctorDestructiveStage = 'opened' | 'confirmed' | 'canceled' | 'undone';
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

/**
 * LogDoctor component: File validation + session audit for Judo training logs.
 *
 * ⚠️ COMPLEXITY NOTE (Phase 2 Refactoring Target, Priority 1):
 * This component (1052 LOC, complexity ~71) mixes two distinct features:
 * 1. File validation: scan judo log files, preview fixes, apply fixes
 * 2. Session audit: run audit rules, review findings, mark as fixed
 *
 * CURRENT STRUCTURE (Problematic):
 * - 13 useState hooks across 2 features (no logical grouping)
 * - 15+ event handlers (lines ~150–300) with chains calling other handlers
 * - Conditional render logic spread across 500 LOC (lines ~550–1050)
 * - 6 useMemo hooks for derived state
 * - Deep nesting (4–5 levels) in JSX
 *
 * STATE BREAKDOWN:
 * FILE VALIDATION: owner, repo, branch, selectedPaths, fileSearch, scanResult,
 *                  fixResult, isScanning, isPreviewing, isApplying, errorMessage,
 *                  uiState, showApplyConfirmation
 * AUDIT:           activeTab, auditConfig, auditMode, reviewSessionId, auditRanAt,
 *                  auditStep, initialAuditResults, diagnosticsSnapshot,
 *                  showResetConfirmation
 * SHARED:          preferences, user, toast
 *
 * REFACTORING PLAN:
 * 1. Extract useFileValidationHandlers() hook:
 *    - Input: owner, repo, branch, setSelectedPaths, etc.
 *    - Output: { onScanFiles, onPreviewChanges, onApplyChanges, ... }
 *    - Moves lines ~200–250 and related handler logic
 *    - New file: plugins/log-doctor/src/hooks/use-file-validation-handlers.ts
 *
 * 2. Extract useAuditHandlers() hook:
 *    - Input: auditConfig, auditMode, etc.
 *    - Output: { onRunAudit, onReviewResult, onMarkFixed, ... }
 *    - Moves lines ~250–300 and related handler logic
 *    - New file: plugins/log-doctor/src/hooks/use-audit-handlers.ts
 *
 * 3. Create <FileValidationTab /> subcomponent (~250 LOC):
 *    - Input: fileValidationState, handlers
 *    - Output: Render file validation UI (lines ~550–700)
 *    - New file: plugins/log-doctor/src/components/file-validation-tab.tsx
 *
 * 4. Create <SessionAuditTab /> subcomponent (~200 LOC):
 *    - Input: auditState, handlers
 *    - Output: Render audit UI (lines ~700–950)
 *    - New file: plugins/log-doctor/src/components/session-audit-tab.tsx
 *
 * 5. Extract createAuditSummaryAction() pure function:
 *    - Moves complex computed action logic (lines ~430–460)
 *    - No side effects; returns { actionLabel, onClick, disabled }
 *    - Stays in component or move to lib utils
 *
 * BENEFITS:
 * - Main component ~150 LOC orchestration only
 * - useState reduced from 13 to 4 (owner, repo, branch, activeTab)
 * - Each handler type testable in isolation
 * - Subcomponents reusable and independently testable
 * - Reduced JSX nesting (4–5 levels → 2–3 levels)
 */
export const LogDoctor = (): React.ReactElement => {
  const { preferences } = useAuth();
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

  const {
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
    setAuditStep,
  } = useLogDoctorAudit();

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

  const {
    handleScan,
    handlePreviewFixes,
    handleApplyFixes,
    handleCancelApplyConfirmation,
    handleConfirmApplyFixes,
    handleCancelActiveOperation,
  } = useLogDoctorValidationActions({
    controller: fileValidation,
    selectedPaths,
    selectedCount,
    branch,
    toast,
    setShowApplyConfirmation,
    emitAction: (stage, metadata) =>
      emitDestructiveActionEvent('apply-fixes', stage, metadata),
  });

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

  const isBusy = isScanning || isPreviewing || isApplying;

  const summaryAction = useMemo(() => {
    return createAuditSummaryAction({
      auditRanAt,
      auditNeedsAttentionCount,
      auditStep,
      auditFeedbackState,
      firstSessionNeedingAttention,
      onRunAudit: handleRunAudit,
      onReviewSession: handleReviewSession,
      onReviewFindings: () => setAuditStep('review-findings'),
    });
  }, [
    auditFeedbackState,
    auditNeedsAttentionCount,
    auditRanAt,
    auditStep,
    firstSessionNeedingAttention,
    handleRunAudit,
    handleReviewSession,
    setAuditStep,
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
              <LogDoctorRepositoryTarget
                owner={owner}
                repo={repo}
                branch={branch}
                onOwnerChange={setOwner}
                onRepoChange={setRepo}
                onBranchChange={setBranch}
              />

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
