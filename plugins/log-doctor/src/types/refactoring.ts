/**
 * Intermediate state types for log-doctor component refactoring.
 * These types help decompose the monolithic component into focused subcomponents.
 */

import type { AuditSessionResult, DiagnosticsSnapshot } from '../components/log-doctor-state';

export type FileValidationState = {
  owner: string;
  repo: string;
  branch: string;
  selectedPaths: string[];
  fileSearch: string;
  scanResult: unknown;
  fixResult: unknown;
  isScanning: boolean;
  isPreviewing: boolean;
  isApplying: boolean;
  errorMessage: string | null;
  uiState: 'idle' | 'loading' | 'error' | 'empty' | 'ready';
  showApplyConfirmation: boolean;
};

export type AuditState = {
  activeTab: 'validation' | 'audit';
  auditConfig: Record<string, boolean>;
  auditMode: 'strict' | 'lenient' | string;
  reviewSessionId: string | null;
  auditRanAt: string | null;
  auditStep: 'run-check' | 'review-findings' | 'resolve-findings';
  initialAuditResults: AuditSessionResult[];
  diagnosticsSnapshot: DiagnosticsSnapshot;
  showResetConfirmation: boolean;
};

export type FileValidationHandlers = {
  onScanFiles: () => void;
  onPreviewChanges: (paths: string[]) => void;
  onApplyChanges: () => void;
  onSelectPath: (path: string) => void;
  onDeselectPath: (path: string) => void;
  onClearSearch: () => void;
};

export type AuditHandlers = {
  onRunAudit: () => Promise<void>;
  onReviewResult: (sessionId: string) => void;
  onMarkFixed: (sessionId: string, ruleId: string) => void;
  onResetDiagnostics: () => void;
  onConfigChange: (config: Record<string, boolean>) => void;
};

export type AuditSummaryAction = {
  actionLabel: string;
  actionIcon: string;
  onClick: () => void;
  disabled: boolean;
};
