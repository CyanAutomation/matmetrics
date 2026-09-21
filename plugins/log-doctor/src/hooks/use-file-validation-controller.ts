import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '@/lib/auth-session';
import {
  isBackgroundJobResult,
  type BackgroundJobResult,
} from '@/lib/background-jobs';
import { parseLogDoctorApiResponse, toErrorReason } from '../lib/api-parser';
import { createUiState } from '../components/log-doctor-state';
import type {
  ScanResult,
  FixResult,
  LogDoctorUiState,
} from '../components/log-doctor-state';

interface FileValidationConfig {
  owner: string;
  repo: string;
  branch: string;
}

interface FileValidationDependencies {
  getAuthHeaders: typeof getAuthHeaders;
  fetch: typeof fetch;
}

const defaultDependencies: FileValidationDependencies = {
  getAuthHeaders,
  fetch: (...args) => fetch(...args),
};

/**
 * Discriminated error type for file validation operations.
 */
type ValidationErrorType =
  'abort' | 'auth' | 'network' | 'validation' | 'unknown';

interface ValidationError {
  type: ValidationErrorType;
  message: string;
}

/**
 * Classifies validation errors into actionable categories.
 */
function classifyValidationError(error: unknown): ValidationError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  ) {
    return { type: 'abort', message: '' };
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return { type: 'network', message: 'Network error occurred' };
  }

  if (error instanceof Error) {
    if (
      error.message.includes('401') ||
      error.message.includes('Unauthorized')
    ) {
      return { type: 'auth', message: 'Authentication failed' };
    }
    return { type: 'validation', message: error.message };
  }

  return { type: 'unknown', message: 'An unexpected error occurred' };
}

/**
 * Builds the request body for file validation operations.
 */
function buildValidationRequestBody(
  action: 'scan' | 'preview' | 'apply',
  config: FileValidationConfig,
  selectedPaths: string[] = []
): unknown {
  if (action === 'scan') {
    return {
      owner: config.owner.trim(),
      repo: config.repo.trim(),
      branch: config.branch.trim() || undefined,
    };
  }

  const mode = action === 'preview' ? 'dry-run' : 'apply';

  return {
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
}

/**
 * Determines the API endpoint for file validation.
 */
function getValidationEndpoint(action: 'scan' | 'preview' | 'apply'): string {
  return action === 'scan'
    ? '/api/github/log-doctor'
    : '/api/github/log-doctor/fix';
}

async function waitForBackgroundJob(
  job: BackgroundJobResult,
  dependencies: FileValidationDependencies,
  signal: AbortSignal
): Promise<unknown> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 500);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new DOMException('Request canceled', 'AbortError'));
        },
        { once: true }
      );
    });
    const headers = await dependencies.getAuthHeaders();
    const response = await dependencies.fetch(
      `/api/background-jobs/${job.id}`,
      { headers, signal }
    );
    const current: unknown = await response.json();
    if (!response.ok || !isBackgroundJobResult(current))
      throw new Error('Unable to read background job status');
    if (current.status === 'completed') return current.result;
    if (current.status === 'failed')
      throw new Error(current.error || 'Background check failed');
  }
  throw new Error('Background check is taking longer than expected');
}

/**
 * Manages the file validation workflow (scan -> preview -> apply).
 * Handles async operations, loading states, error messages, and state persistence.
 */
export const useFileValidationController = (
  config: FileValidationConfig,
  dependencies: FileValidationDependencies = defaultDependencies
) => {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uiState, setUiState] = useState<LogDoctorUiState>({
    phase: 'idle',
    operation: null,
    message: '',
  });
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    };
  }, []);

  const performValidationAction = useCallback(
    async (
      action: 'scan' | 'preview' | 'apply',
      selectedPaths: string[] = []
    ): Promise<void> => {
      // Validate preconditions for preview/apply
      if (
        (action === 'preview' || action === 'apply') &&
        selectedPaths.length === 0
      ) {
        setErrorMessage(
          `Select at least one file before ${action === 'preview' ? 'previewing' : 'applying'} fixes.`
        );
        return;
      }

      // Abort previous request and track new one
      activeControllerRef.current?.abort();
      const requestId = ++requestIdRef.current;
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const isCurrentRequest = (): boolean =>
        isMountedRef.current && requestIdRef.current === requestId;

      if (!isCurrentRequest()) {
        return;
      }

      // Initialize loading state
      setErrorMessage(null);
      setIsScanning(action === 'scan');
      setIsPreviewing(action === 'preview');
      setIsApplying(action === 'apply');
      setUiState(createUiState(action, 'loading'));

      try {
        // Get auth headers and build request
        const headers = await dependencies.getAuthHeaders({
          'Content-Type': 'application/json',
        });
        const endpoint = getValidationEndpoint(action);
        const body = buildValidationRequestBody(action, config, selectedPaths);

        // Make request and handle response
        const response = await dependencies.fetch(endpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify(body),
        });

        // Handle scan vs fix responses
        if (action === 'scan') {
          const initial: unknown = await response.json();
          const payload =
            response.status === 202 && isBackgroundJobResult(initial)
              ? ((await waitForBackgroundJob(
                  initial,
                  dependencies,
                  controller.signal
                )) as ScanResult)
              : (initial as ScanResult);
          if (response.status >= 400) {
            throw new Error('Log Doctor scan request failed');
          }
          if (!isCurrentRequest()) {
            return;
          }
          setScanResult(payload);
          setUiState(
            payload.summary.totalFiles === 0
              ? createUiState(action, 'empty', { hasLogs: false })
              : createUiState(action, 'success')
          );
        } else {
          const payload = await parseLogDoctorApiResponse<FixResult>(response);
          if (!isCurrentRequest()) {
            return;
          }
          setFixResult(payload);
          setUiState(
            payload.files.length === 0
              ? createUiState(action, 'empty', { hasFindings: false })
              : createUiState(action, 'success')
          );
        }
      } catch (error) {
        if (!isCurrentRequest()) {
          return;
        }

        // Classify and handle errors
        const classified = classifyValidationError(error);
        if (classified.type === 'abort') {
          setErrorMessage(null);
          setUiState({ phase: 'idle', operation: null, message: '' });
          return;
        }

        const reason = toErrorReason(error);
        const errorUiState = createUiState(action, 'error', { reason });
        setErrorMessage(errorUiState.message);
        setUiState(errorUiState);
      } finally {
        if (isCurrentRequest() && activeControllerRef.current === controller) {
          activeControllerRef.current = null;
          setIsScanning(false);
          setIsPreviewing(false);
          setIsApplying(false);
        }
      }
    },
    [config, dependencies]
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
    activeControllerRef.current?.abort();
  }, []);

  const reset = useCallback((): void => {
    requestIdRef.current += 1;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    setScanResult(null);
    setFixResult(null);
    setIsScanning(false);
    setIsPreviewing(false);
    setIsApplying(false);
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
