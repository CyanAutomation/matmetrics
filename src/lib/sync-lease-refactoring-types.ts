/**
 * Intermediate state types for sync-lease refactoring.
 * These types clarify retry loop state machine and eliminate scattered variables.
 */

export type RetryAttemptState = {
  /** Current attempt number (1-based) */
  attempt: number;

  /** Signature of the current stable contender (if any) */
  stableContenderSignature?: string;

  /** Number of observations confirming contender stability */
  stableContenderObservations: number;

  /** Current lease ID, if acquired */
  currentLeaseId?: string;

  /** Last error encountered, if any */
  lastError?: string;
};

export type LeaseEligibilityResult = {
  /** Whether lease can be acquired in this attempt */
  eligible: boolean;

  /** Reason for eligibility decision */
  reason: string;

  /** Whether existing lease should be force-reclaimed */
  shouldForceReclaim: boolean;

  /** Time (ms) to wait before next attempt */
  backoffMs: number;
};

export type SingleLeaseAcquisitionResult = {
  /** Whether lease was successfully acquired */
  acquired: boolean;

  /** Acquired lease ID, if successful */
  leaseId?: string;

  /** Error message, if acquisition failed */
  error?: string;

  /** Attempt metadata for logging/debugging */
  attempt: number;
};
