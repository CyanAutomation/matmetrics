'use client';

import { useState, useCallback, useMemo } from 'react';
import { getAuthHeaders } from '@/lib/auth-session';
import { useToast } from '@/hooks/use-toast';
import {
  createUiState,
  resolveResetDiagnosticsSnapshot,
  type LogDoctorUiState,
  type ScanResult,
  type ScanFileResult,
  type FixResult,
  type DiagnosticsSnapshot,
} from '../components/log-doctor-state';
import {
  parseApiResponse,
  toErrorReason,
  emitDestructiveActionEvent,
} from '../components/log-doctor';
import { ToastAction } from '@/components/ui/toast';

interface UseLogDoctorValidationState {
  owner: string;
  repo: string;
  branch: string;
  isScanning: boolean;
  isPreviewing: boolean;
  isApplying: boolean;
  errorMessage: string | null;
  uiState: LogDoctorUiState;
  scanResult: ScanResult | null;
  fixResult: FixResult | null;
  selectedPaths: string[];
  showApplyConfirmation: boolean;
  showResetConfirmation: boolean;
  fileSearch: string;
  isBusy: boolean;
  selectedCount: number;
}

interface UseLogDoctorValidationActions {
  setOwner: (value: string) => void;
  setRepo: (value: string) => void;
  setBranch: (value: string) => void;
  setFileSearch: (value: string) => void;
  togglePath: (path: string) => void;
  handleScan: () => Promise<void>;
  handlePreviewFixes: () => Promise<void>;
  handleApplyFixes: () => void;
  handleCancelApplyConfirmation: () => void;
  handleConfirmApplyFixes: () => Promise<void>;
  handleCancelActiveOperation: () => void;
  handleResetDiagnosticsState: () => void;
  handleCancelResetConfirmation: () => void;
  handleConfirmResetDiagnosticsState: () => void;
  filteredInvalidFiles: Array<{ path: string; status: string }>;
  invalidFiles: Array<{ path: string; status: string }>;
  selectIdByPath: Map<string, string>;
}

const EMPTY_DIAGNOSTICS_SNAPSHOT = {
  uiState: createUiState('scan', 'idle'),
};

export function useLogDoctorValidation(): UseLogDoctorValidationState &
  UseLogDoctorValidationActions {
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

  const invalidFiles = useMemo(
    () => scanResult?.files.filter((file) => file.status === 'invalid') ?? [],
    [scanResult]
  );

  const selectIdByPath = useMemo(() => {
    const map = new Map<string, string>();
    invalidFiles.forEach((file: ScanFileResult, rowIndex: number) => {
      const id = `log-doctor-file-${rowIndex}-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
      map.set(file.path, id);
    });
    return map;
  }, [invalidFiles]);

  const filteredInvalidFiles = useMemo(() => {
    const normalizedSearch = fileSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return invalidFiles;
    }
    return invalidFiles.filter((file: ScanFileResult) =>
      file.path.toLowerCase().includes(normalizedSearch)
    );
  }, [fileSearch, invalidFiles]);

  const togglePath = useCallback((path: string): void => {
    setSelectedPaths((current) =>
      current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path]
    );
  }, []);

  const handleScan = useCallback(async (): Promise<void> => {
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
  }, [owner, repo, branch]);

  const handlePreviewFixes = useCallback(async (): Promise<void> => {
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
  }, [owner, repo, branch, selectedPaths]);

  const executeApplyFixes = useCallback(async (): Promise<void> => {
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
  }, [owner, repo, branch, selectedPaths]);

  const handleApplyFixes = useCallback((): void => {
    setShowApplyConfirmation(true);
    emitDestructiveActionEvent('apply-fixes', 'opened', {
      selectedCount: selectedPaths.length,
      branch: branch.trim() || 'default branch',
    });
  }, [branch, selectedPaths.length]);

  const handleCancelApplyConfirmation = useCallback((): void => {
    setShowApplyConfirmation(false);
    emitDestructiveActionEvent('apply-fixes', 'canceled', {
      selectedCount: selectedPaths.length,
    });
  }, [selectedPaths.length]);

  const handleConfirmApplyFixes = useCallback(async (): Promise<void> => {
    emitDestructiveActionEvent('apply-fixes', 'confirmed', {
      selectedCount: selectedPaths.length,
      branch: branch.trim() || 'default branch',
    });
    setShowApplyConfirmation(false);
    await executeApplyFixes();
  }, [branch, selectedPaths.length, executeApplyFixes]);

  const handleCancelActiveOperation = useCallback((): void => {
    activeController?.abort();
  }, [activeController]);

  const handleResetDiagnosticsState = useCallback((): void => {
    setShowResetConfirmation(true);
    emitDestructiveActionEvent('reset-diagnostics-state', 'opened');
  }, []);

  const handleCancelResetConfirmation = useCallback((): void => {
    setShowResetConfirmation(false);
    emitDestructiveActionEvent('reset-diagnostics-state', 'canceled');
  }, []);

  const handleConfirmResetDiagnosticsState = useCallback((): void => {
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
              resolved.previous?.uiState ??
                EMPTY_DIAGNOSTICS_SNAPSHOT.uiState
            );
            setErrorMessage(resolved.previous?.errorMessage ?? null);
            emitDestructiveActionEvent('reset-diagnostics-state', 'undone');
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  }, [toast, scanResult, fixResult, selectedPaths, uiState, errorMessage]);

  const isBusy = isScanning || isPreviewing || isApplying;
  const selectedCount = selectedPaths.length;

  return {
    owner,
    repo,
    branch,
    isScanning,
    isPreviewing,
    isApplying,
    errorMessage,
    uiState,
    scanResult,
    fixResult,
    selectedPaths,
    showApplyConfirmation,
    showResetConfirmation,
    fileSearch,
    isBusy,
    selectedCount,
    setOwner,
    setRepo,
    setBranch,
    setFileSearch,
    togglePath,
    handleScan,
    handlePreviewFixes,
    handleApplyFixes,
    handleCancelApplyConfirmation,
    handleConfirmApplyFixes,
    handleCancelActiveOperation,
    handleResetDiagnosticsState,
    handleCancelResetConfirmation,
    handleConfirmResetDiagnosticsState,
    filteredInvalidFiles,
    invalidFiles,
    selectIdByPath,
  };
}
