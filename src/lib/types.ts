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

export interface UserPreferences {
  transformerPrompt: string;
  gitHub: GitHubSettings;
  migratedLocalSettingsAt?: string;
}

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
