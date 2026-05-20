import { useCallback, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth-session';
import { parseLogDoctorApiResponse, toErrorReason } from '../lib/api-parser';
import { createUiState } from '../components/log-doctor-state';
import type { ScanResult, FixResult, LogDoctorUiState } from '../components/log-doctor-state';

interface FileValidationConfig {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Manages the file validation workflow (scan -> preview -> apply).
 * Handles async operations, loading states, error messages, and state persistence.
 */
export const useFileValidationController = (config: FileValidationConfig) => {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uiState, setUiState] = useState<LogDoctorUiState>({ phase: 'idle', operation: null, message: '' });
  const [activeController, setActiveController] = useState<AbortController | null>(null);

  const performValidationAction = useCallback(
    async (
      action: 'scan' | 'preview' | 'apply',
      selectedPaths: string[] = []
    ): Promise<void> => {
      // Validate preconditions for preview/apply
      if ((action === 'preview' || action === 'apply') && selectedPaths.length === 0) {
        setErrorMessage(`Select at least one file before ${action === 'preview' ? 'previewing' : 'applying'} fixes.`);
        return;
      }

      setErrorMessage(null);

      if (action === 'scan') {
        setIsScanning(true);
      } else if (action === 'preview') {
        setIsPreviewing(true);
      } else {
        setIsApplying(true);
      }

      setUiState(createUiState(action, 'loading'));
      const controller = new AbortController();
      setActiveController(controller);

      try {
        const headers = await getAuthHeaders({
          'Content-Type': 'application/json',
        });

        const endpoint = action === 'scan' ? '/api/github/log-doctor' : '/api/github/log-doctor/fix';
        const mode = action === 'scan' ? undefined : action === 'preview' ? 'dry-run' : 'apply';

        const body =
          action === 'scan'
            ? {
                owner: config.owner.trim(),
                repo: config.repo.trim(),
                branch: config.branch.trim() || undefined,
              }
            : {
                owner: config.owner.trim(),
                repo: config.repo.trim(),
                branch: config.branch.trim() || undefined,
                mode,
                confirmApply: action === 'apply',
                paths: selectedPaths,
                options: {
                  normalizeFrontmatter: true,
                  enforceSectionOrder: true,
                  preserveUserContent: true,
                },
              };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify(body),
        });

        if (action === 'scan') {
          const payload = await parseLogDoctorApiResponse<ScanResult>(response);
          setScanResult(payload);
          setUiState(
            payload.summary.totalFiles === 0
              ? createUiState(action, 'empty', { hasLogs: false })
              : createUiState(action, 'success')
          );
        } else {
          const payload = await parseLogDoctorApiResponse<FixResult>(response);
          setFixResult(payload);
          setUiState(
            payload.files.length === 0
              ? createUiState(action, 'empty', { hasFindings: false })
              : createUiState(action, 'success')
          );
        }
      } catch (error) {
        const reason = toErrorReason(error);
        const errorUiState = createUiState(action, 'error', { reason });
        setErrorMessage(errorUiState.message);
        setUiState(errorUiState);
      } finally {
        setActiveController(null);
        if (action === 'scan') {
          setIsScanning(false);
        } else if (action === 'preview') {
          setIsPreviewing(false);
        } else {
          setIsApplying(false);
        }
      }
    },
    [config]
  );

  const scanFiles = useCallback((): Promise<void> => {
    return performValidationAction('scan');
  }, [performValidationAction]);

  const previewFixes = useCallback(
    (selectedPaths: string[]): Promise<void> => {
      return performValidationAction('preview', selectedPaths);
    },
    [performValidationAction]
  );

  const applyFixes = useCallback(
    (selectedPaths: string[]): Promise<void> => {
      return performValidationAction('apply', selectedPaths);
    },
    [performValidationAction]
  );

  const cancelOperation = useCallback((): void => {
    activeController?.abort();
  }, [activeController]);

  const reset = useCallback((): void => {
    setScanResult(null);
    setFixResult(null);
    setErrorMessage(null);
    setUiState({ phase: 'idle', operation: null, message: '' });
  }, []);

  return {
    // State
    scanResult,
    fixResult,
    isScanning,
    isPreviewing,
    isApplying,
    errorMessage,
    uiState,

    // Actions
    scanFiles,
    previewFixes,
    applyFixes,
    cancelOperation,
    reset,

    // State setters (for testing/manual control)
    setScanResult,
    setFixResult,
    setErrorMessage,
    setUiState,
  };
};
