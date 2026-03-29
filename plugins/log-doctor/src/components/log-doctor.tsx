'use client';

import React, { useEffect, useMemo, useState } from 'react';

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
import { getAuthHeaders } from '@/lib/auth-session';
import { createDomSafePathId } from './dom-safe-id';

import {
  canConfirmApplyFixes,
  createUiState,
  resolveResetDiagnosticsSnapshot,
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

const toErrorReason = (error: unknown): string => {
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

const parseApiResponse = async <T,>(response: Response): Promise<T> => {
  const payload = (await response.json()) as T;
  if (!response.ok) {
    const maybeMessage =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? 'Request failed')
        : 'Request failed';
    throw new Error(maybeMessage);
  }
  return payload;
};

export const LogDoctor = (): React.ReactElement => {
  const { preferences } = useAuth();
  const { toast } = useToast();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uiState, setUiState] = useState<LogDoctorUiState>(
    createUiState('scan', 'idle')
  );

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [activeController, setActiveController] = useState<AbortController | null>(
    null
  );
  const [showApplyConfirmation, setShowApplyConfirmation] = useState(false);
  const [applyConfirmationValue, setApplyConfirmationValue] = useState('');
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

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

  const togglePath = (path: string): void => {
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path]
    );
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
              resolved.previous?.uiState ?? createUiState('scan', 'idle')
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

  const isBusy = isScanning || isPreviewing || isApplying;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <h2 className="text-lg font-semibold">Log Doctor</h2>
      <p className="text-sm text-muted-foreground">
        Scan, preview, and optionally apply markdown normalization fixes in two
        steps.
      </p>

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

      <Alert>
        <AlertTitle>
          {uiState.phase === 'loading'
            ? 'Log Doctor is running'
            : uiState.phase === 'error'
              ? 'Recovery available'
              : 'Status'}
        </AlertTitle>
        <AlertDescription>{uiState.message}</AlertDescription>
      </Alert>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Log Doctor error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={handleScan}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

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
            <Label htmlFor="apply-fixes-confirm-text">
              Confirmation text
            </Label>
            <Input
              id="apply-fixes-confirm-text"
              value={applyConfirmationValue}
              onChange={(event) => setApplyConfirmationValue(event.target.value)}
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
