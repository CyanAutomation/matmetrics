export type EffortLevel = 1 | 2 | 3 | 4 | 5;
export type SessionCategory = 'Technical' | 'Randori' | 'Shiai';

export interface JudoSession {
  id: string;
  date: string;
  description?: string;
  techniques: string[];
  effort: EffortLevel;
  category: SessionCategory;
  notes?: string;
  duration?: number; // in minutes
  videoUrl?: string; // optional absolute http:// or https:// URL to session video
}

export interface MutationResult {
  status: 'synced' | 'queued';
  message?: string;
}

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  1: 'Easy',
  2: 'Light',
  3: 'Normal',
  4: 'Hard',
  5: 'Intense',
};

export const EFFORT_COLORS: Record<EffortLevel, string> = {
  1: 'bg-slate-100 text-slate-700 border-slate-200',
  2: 'bg-sky-100 text-sky-700 border-sky-200',
  3: 'bg-blue-100 text-blue-700 border-blue-200',
  4: 'bg-amber-100 text-amber-700 border-amber-200',
  5: 'bg-red-100 text-red-700 border-red-200',
};

export const CATEGORY_COLORS: Record<SessionCategory, string> = {
  Technical: 'bg-orange-100 text-orange-700 border-orange-200',
  Randori: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Shiai: 'bg-rose-100 text-rose-700 border-rose-200',
};

/**
 * GitHub configuration for syncing sessions
 */
export interface GitHubConfig {
  owner: string; // GitHub username/org
  repo: string; // Repository name
  branch?: string; // Optional branch; defaults to repository default branch
}

export type SessionFileIssueCode = 'parse_failed' | 'read_failed';

export interface SessionFileIssue {
  source: 'github' | 'local';
  code: SessionFileIssueCode;
  filePath: string;
  message: string;
}

/**
 * GitHub sync status
 */
export type GitHubSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

/**
 * GitHub settings stored in localStorage
 */
export interface GitHubSettings {
  config?: GitHubConfig;
  enabled: boolean;
  migrationDone: boolean;
  lastSyncTime?: string;
  syncStatus: GitHubSyncStatus;
}

export interface VideoLibraryPreferences {
  customAllowedDomains: string[];
  linkChecksBySessionId: Record<string, VideoLinkCheckSnapshot>;
}

export type VideoLinkCheckStatus =
  | 'reachable'
  | 'broken'
  | 'disallowed_domain'
  | 'check_failed';

export interface VideoLinkCheckSnapshot {
  url: string;
  hostname: string;
  status: VideoLinkCheckStatus;
  checkedAt: string;
  httpStatus?: number;
  error?: string;
}

export interface AuditRunResult {
  sessions: Array<{
    sessionId: string;
    sessionDate: string;
    flags: AuditFlag[];
  }>;
  ranAt: string; // ISO timestamp
}

export interface UserPreferences {
  transformerPrompt: string;
  gitHub: GitHubSettings;
  videoLibrary: VideoLibraryPreferences;
  migratedLocalSettingsAt?: string;
  sessionAudits?: Record<string, SessionAudit>; // sessionId -> audit state
  auditMode?: AuditMode;
  auditConfig?: AuditConfig;
  lastAuditRun?: AuditRunResult; // cached result from last audit run
}

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * Session audit: data quality checks and user review state
 */
export type AuditFlagCode =
  | 'no_techniques_high_effort'
  | 'empty_description'
  | 'empty_notes'
  | 'duration_outlier';

export type AuditSeverity = 'info' | 'warning' | 'error';

export interface AuditFlag {
  code: AuditFlagCode;
  severity: AuditSeverity;
  message: string;
}

export interface AuditRuleConfig {
  code: AuditFlagCode;
  enabled: boolean;
  effortThreshold?: number; // for no_techniques_high_effort: effort level that triggers (default 4)
  durationStdDevMultiplier?: number; // for duration_outlier: std dev threshold (default 2)
}

export interface SessionAudit {
  sessionId: string;
  flags: AuditFlag[];
  reviewedAt?: string; // ISO timestamp when user marked as reviewed
  ignoredRules: AuditFlagCode[]; // rules user chose to ignore for this session
}

export interface AuditConfig {
  rules: AuditRuleConfig[];
}

export type AuditMode = 'standard' | 'strict' | 'custom';

/**
 * Default audit configuration
 */
export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  rules: [
    {
      code: 'no_techniques_high_effort',
      enabled: true,
      effortThreshold: 4,
    },
    {
      code: 'empty_description',
      enabled: true,
    },
    {
      code: 'empty_notes',
      enabled: true,
    },
    {
      code: 'duration_outlier',
      enabled: true,
      durationStdDevMultiplier: 2,
    },
  ],
};

/**
 * Strict audit configuration
 */
export const STRICT_AUDIT_CONFIG: AuditConfig = {
  rules: [
    {
      code: 'no_techniques_high_effort',
      enabled: true,
      effortThreshold: 3,
    },
    {
      code: 'empty_description',
      enabled: true,
    },
    {
      code: 'empty_notes',
      enabled: true,
    },
    {
      code: 'duration_outlier',
      enabled: true,
      durationStdDevMultiplier: 1.5,
    },
  ],
};
