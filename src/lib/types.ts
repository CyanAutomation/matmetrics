export type EffortLevel = 1 | 2 | 3 | 4 | 5;
export const SESSION_CATEGORIES = [
  'Technical',
  'Randori',
  'Shiai',
  'Cardio',
  'S&C',
] as const;

export type SessionCategory = (typeof SESSION_CATEGORIES)[number];

export const DEFAULT_ENABLED_SESSION_CATEGORIES: SessionCategory[] = [
  ...SESSION_CATEGORIES,
];

export interface SessionTypePreferences {
  enabledCategories: SessionCategory[];
}
export type TrainingPlanCadence = 'week' | 'month';

/**
 * A personal training commitment for one kind of session. This intentionally
 * captures only the athlete's target—not uncertain club availability.
 */
export interface TrainingPlanCategory {
  targetSessions: number;
  cadence: TrainingPlanCadence;
}

export interface TrainingPlanPreferences {
  categories: Record<SessionCategory, TrainingPlanCategory>;
}

export const DEFAULT_TRAINING_PLAN: TrainingPlanPreferences = {
  categories: {
    Technical: { targetSessions: 1, cadence: 'week' },
    Randori: { targetSessions: 2, cadence: 'month' },
    Shiai: { targetSessions: 1, cadence: 'month' },
    Cardio: { targetSessions: 0, cadence: 'month' },
    'S&C': { targetSessions: 0, cadence: 'month' },
  },
};

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
  /** Opaque GitHub revision observed when this session was read. */
  revisionSha?: string;
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

export const DEFAULT_EXPECTED_VIDEO_CATEGORIES: SessionCategory[] = [
  'Technical',
];

export interface VideoLibraryPreferences {
  customAllowedDomains: string[];
  linkChecksBySessionId: Record<string, VideoLinkCheckSnapshot>;
  expectedVideoCategories: SessionCategory[];
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
  trainingPlan: TrainingPlanPreferences;
  sessionTypes: SessionTypePreferences;
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
