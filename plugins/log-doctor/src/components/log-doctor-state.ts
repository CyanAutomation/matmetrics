export interface ScanFileResult {
  path: string;
  status: 'valid' | 'invalid';
  errors?: string[];
  id?: string;
  date?: string;
}

export interface ScanResult {
  success: boolean;
  message: string;
  branch?: string;
  summary: {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
  };
  files: ScanFileResult[];
}

export interface FixFileResult {
  path: string;
  status: 'preview' | 'unchanged' | 'applied' | 'error';
  message?: string;
  commitSha?: string;
  validationState: {
    before: string;
    after: string;
    errors?: string[];
  };
  preview: {
    changed: boolean;
    diff: string;
    originalBytes: number;
    updatedBytes: number;
  };
}

export interface FixResult {
  success: boolean;
  message: string;
  mode: 'dry-run' | 'apply';
  branch?: string;
  files: FixFileResult[];
}

export type LogDoctorPhase = 'idle' | 'loading' | 'empty' | 'error' | 'success';

export type LogDoctorOperation = 'scan' | 'preview' | 'apply';

export type LogDoctorUiState = {
  phase: LogDoctorPhase;
  operation: LogDoctorOperation | null;
  message: string;
};

export type DiagnosticsSnapshot = {
  scanResult: ScanResult | null;
  fixResult: FixResult | null;
  selectedPaths: string[];
  uiState: LogDoctorUiState;
  errorMessage: string | null;
};

const ABORTED_REQUEST_REASON = 'Request canceled';

type ErrorCategory = 'aborted' | 'config' | 'network' | 'state';

const CONFIG_ERROR_HINTS = [
  'matmetrics_go_proxy_base_url',
  'proxy',
  'configuration',
  'misconfigured',
  'env',
  'environment variable',
  'upstream',
  'gateway',
  '502',
  '503',
  '504',
  'auth',
  'unauthorized',
  'forbidden',
  '401',
  '403',
  'credential',
  'token',
];

const NETWORK_ERROR_HINTS = [
  'failed to fetch',
  'network',
  'timeout',
  'timed out',
  'econnrefused',
  'connection reset',
  'dns',
];

const classifyErrorReason = (reason: string): ErrorCategory => {
  if (reason === ABORTED_REQUEST_REASON) {
    return 'aborted';
  }

  const normalizedReason = reason.toLowerCase();
  if (CONFIG_ERROR_HINTS.some((hint) => normalizedReason.includes(hint))) {
    return 'config';
  }

  if (NETWORK_ERROR_HINTS.some((hint) => normalizedReason.includes(hint))) {
    return 'network';
  }

  return 'state';
};

const createErrorMessage = (
  operation: LogDoctorOperation,
  reason: string
): string => {
  const operationLabel =
    operation === 'scan'
      ? 'Scanning'
      : operation === 'preview'
        ? 'Previewing fixes'
        : 'Applying fixes';

  const errorCategory = classifyErrorReason(reason);
  const nextStep =
    errorCategory === 'aborted'
      ? 'Run the check again when you are ready.'
      : errorCategory === 'config' || errorCategory === 'network'
        ? 'Check server/proxy configuration and retry.'
        : operation === 'scan'
          ? 'Check repository access and retry.'
          : 'Refresh logs and retry.';

  return `${operationLabel} failed: ${reason} Next step: ${nextStep}`;
};

export const createUiState = (
  operation: LogDoctorOperation,
  phase: LogDoctorPhase,
  details?: {
    reason?: string;
    hasLogs?: boolean;
    hasFindings?: boolean;
  }
): LogDoctorUiState => {
  if (phase === 'idle') {
    return {
      phase,
      operation: null,
      message: 'Select a source, then run Log Doctor.',
    };
  }

  if (phase === 'loading') {
    const operationLabel =
      operation === 'scan'
        ? 'Fetching logs'
        : operation === 'preview'
          ? 'Analyzing findings'
          : 'Applying fixes';

    return {
      phase,
      operation,
      message: `${operationLabel}… this can take up to 30 seconds for larger repositories.`,
    };
  }

  if (phase === 'empty') {
    const emptyMessage =
      details?.hasLogs === false
        ? 'No logs were found for this source. Select source or refresh logs.'
        : details?.hasFindings === false
          ? 'No findings to show yet. Refresh logs or run a new scan.'
          : 'No data is available yet. Select source or refresh logs.';
    return { phase, operation, message: emptyMessage };
  }

  if (phase === 'error') {
    return {
      phase,
      operation,
      message: createErrorMessage(
        operation,
        details?.reason ?? 'Unknown request error.'
      ),
    };
  }

  return {
    phase: 'success',
    operation,
    message: 'Findings ready.',
  };
};

export const createEmptyDiagnosticsSnapshot = (): DiagnosticsSnapshot => ({
  scanResult: null,
  fixResult: null,
  selectedPaths: [],
  uiState: createUiState('scan', 'idle'),
  errorMessage: null,
});

export const canConfirmApplyFixes = (value: string): boolean =>
  value.trim().toUpperCase() === 'APPLY';

export const resolveResetDiagnosticsSnapshot = (
  current: DiagnosticsSnapshot,
  confirmed: boolean
): {
  next: DiagnosticsSnapshot;
  previous: DiagnosticsSnapshot | null;
} => {
  if (!confirmed) {
    return { next: current, previous: null };
  }

  return {
    next: createEmptyDiagnosticsSnapshot(),
    previous: {
      ...current,
      selectedPaths: [...current.selectedPaths],
    },
  };
};
