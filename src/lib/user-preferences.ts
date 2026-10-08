'use client';

import { DEFAULT_TRANSFORMER_PROMPT } from './ai-prompts';
import { getAuthHeaders } from './auth-session';
import { getScopedStorageKey } from './client-identity';
import type {
  AuditConfig,
  AuditMode,
  AuditRunResult,
  GitHubSettings,
  SessionCategory,
  SessionAudit,
  SemanticAuditRunSummary,
  SessionTypePreferences,
  TrainingPlanPreferences,
  UserPreferences,
  VideoLibraryPreferences,
  VideoLinkCheckSnapshot,
} from './types';
import {
  DEFAULT_AUDIT_CONFIG,
  DEFAULT_TRAINING_PLAN,
  DEFAULT_EXPECTED_VIDEO_CATEGORIES,
  DEFAULT_ENABLED_SESSION_CATEGORIES,
  SESSION_CATEGORIES,
} from './types';
import {
  areAuditConfigsEqual,
  getAuditConfigPreset,
  inferAuditModeFromConfig,
  normalizeAuditConfigShape,
} from './audit-presets';
import {
  PREFERENCE_API_ERROR_CODES,
  isPreferenceApiErrorCode,
  type PreferenceApiErrorCode,
  type PreferenceFailureCategory,
} from './preference-api-errors';

export { DEFAULT_TRANSFORMER_PROMPT };

const LEGACY_PROMPT_KEY = 'matmetrics_transformer_prompt';
const LEGACY_GITHUB_CONFIG_KEY = 'matmetrics_github_config';
const PREFERENCES_CACHE_KEY = 'matmetrics_user_preferences';

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  enabled: false,
  migrationDone: false,
  syncStatus: 'idle',
};

export const DEFAULT_VIDEO_LIBRARY_PREFERENCES: VideoLibraryPreferences = {
  customAllowedDomains: [],
  linkChecksBySessionId: {},
  expectedVideoCategories: [...DEFAULT_EXPECTED_VIDEO_CATEGORIES],
};

const DEFAULT_SESSION_TYPE_PREFERENCES: SessionTypePreferences = {
  enabledCategories: [...DEFAULT_ENABLED_SESSION_CATEGORIES],
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  transformerPrompt: DEFAULT_TRANSFORMER_PROMPT,
  gitHub: DEFAULT_GITHUB_SETTINGS,
  videoLibrary: DEFAULT_VIDEO_LIBRARY_PREFERENCES,
  sessionAudits: {},
  auditMode: 'standard',
  auditConfig: DEFAULT_AUDIT_CONFIG,
  lastAuditRun: undefined,
  trainingPlan: DEFAULT_TRAINING_PLAN,
  sessionTypes: DEFAULT_SESSION_TYPE_PREFERENCES,
};

type PreferencesListener = (preferences: UserPreferences) => void;

type PreferenceRequestFailureStage = 'authentication' | 'network' | 'response';

export class PreferenceRequestError extends Error {
  constructor(
    readonly method: string,
    readonly stage: PreferenceRequestFailureStage,
    readonly status?: number,
    readonly code?: PreferenceApiErrorCode,
    readonly category: PreferenceFailureCategory = getPreferenceFailureCategory(
      stage,
      status,
      code
    )
  ) {
    super(
      category === 'authentication'
        ? 'Your session could not be verified. Sign in again to refresh saved preferences.'
        : category === 'configuration'
          ? 'Saved preferences are not configured. Contact the site administrator.'
          : category === 'unavailable'
            ? 'Your saved preferences are temporarily unavailable. You can continue using MatMetrics and try again.'
            : 'Saved preferences could not be refreshed. Reload the page or contact support if the issue continues.'
    );
    this.name = 'PreferenceRequestError';
  }

  get canRetry(): boolean {
    return this.category === 'unavailable';
  }

  get diagnostic(): string {
    if (this.stage === 'authentication') {
      return `Could not authenticate preferences ${this.method} request`;
    }
    if (this.stage === 'network') {
      return `Could not reach the server for preferences ${this.method} request`;
    }
    return `Preferences ${this.method} request returned HTTP ${this.status}`;
  }
}

function getPreferenceFailureCategory(
  stage: PreferenceRequestFailureStage,
  status?: number,
  code?: PreferenceApiErrorCode
): PreferenceFailureCategory {
  if (
    code === PREFERENCE_API_ERROR_CODES.authenticationRequired ||
    code === PREFERENCE_API_ERROR_CODES.authenticationFailed
  ) {
    return 'authentication';
  }
  if (code === PREFERENCE_API_ERROR_CODES.authenticationUnavailable) {
    return 'unavailable';
  }
  if (
    code === PREFERENCE_API_ERROR_CODES.authenticationConfiguration ||
    code === PREFERENCE_API_ERROR_CODES.storeConfiguration
  ) {
    return 'configuration';
  }
  if (code === PREFERENCE_API_ERROR_CODES.unavailable) return 'unavailable';
  if (code) return 'request';
  if (stage === 'authentication') return 'authentication';
  if (stage === 'network' || (status !== undefined && status >= 500)) {
    return 'unavailable';
  }
  if (status === 401) return 'authentication';
  return 'request';
}

let currentPreferences: UserPreferences = DEFAULT_USER_PREFERENCES;
let loadedUserId: string | null = null;
let currentPreferencesRevision = 0;
const listeners = new Set<PreferencesListener>();

async function requestPreferences<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  let headers: HeadersInit;
  try {
    headers = await getAuthHeaders(init?.headers);
  } catch {
    throw new PreferenceRequestError(method, 'authentication');
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new PreferenceRequestError(method, 'network');
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { code?: unknown }
      | null;
    const code = isPreferenceApiErrorCode(payload?.code)
      ? payload.code
      : undefined;
    throw new PreferenceRequestError(
      method,
      'response',
      response.status,
      code
    );
  }
  return response.json() as Promise<T>;
}

async function persistCurrentPreferences(): Promise<void> {
  const result = await requestPreferences<{
    preferences: unknown;
    revision: number;
  }>('/api/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preferences: currentPreferences,
      revision: currentPreferencesRevision,
    }),
  });
  currentPreferencesRevision = result.revision;
}

function notifyPreferencesChanged(): void {
  for (const listener of listeners) {
    listener(currentPreferences);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('preferencesSync', {
        detail: { preferences: currentPreferences },
      })
    );
  }
}

function cloneDefaults(): UserPreferences {
  return {
    transformerPrompt: DEFAULT_TRANSFORMER_PROMPT,
    gitHub: { ...DEFAULT_GITHUB_SETTINGS },
    videoLibrary: { ...DEFAULT_VIDEO_LIBRARY_PREFERENCES },
    sessionAudits: {},
    auditMode: 'standard',
    auditConfig: {
      rules: DEFAULT_AUDIT_CONFIG.rules.map((rule) => ({ ...rule })),
    },
    lastAuditRun: undefined,
    trainingPlan: {
      categories: {
        Technical: { ...DEFAULT_TRAINING_PLAN.categories.Technical },
        Randori: { ...DEFAULT_TRAINING_PLAN.categories.Randori },
        Shiai: { ...DEFAULT_TRAINING_PLAN.categories.Shiai },
        Cardio: { ...DEFAULT_TRAINING_PLAN.categories.Cardio },
        'S&C': { ...DEFAULT_TRAINING_PLAN.categories['S&C'] },
      },
    },
    sessionTypes: {
      enabledCategories: [...DEFAULT_ENABLED_SESSION_CATEGORIES],
    },
  };
}

function normalizePlanCount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(31, Math.round(value)));
}

export function normalizeTrainingPlanPreferences(
  value: unknown
): TrainingPlanPreferences {
  if (!value || typeof value !== 'object') {
    return {
      categories: {
        Technical: { ...DEFAULT_TRAINING_PLAN.categories.Technical },
        Randori: { ...DEFAULT_TRAINING_PLAN.categories.Randori },
        Shiai: { ...DEFAULT_TRAINING_PLAN.categories.Shiai },
        Cardio: { ...DEFAULT_TRAINING_PLAN.categories.Cardio },
        'S&C': { ...DEFAULT_TRAINING_PLAN.categories['S&C'] },
      },
    };
  }

  const input = value as Partial<TrainingPlanPreferences>;
  const categories = SESSION_CATEGORIES.reduce(
    (result, category) => {
      const savedCategory = input.categories?.[category];
      const defaults = DEFAULT_TRAINING_PLAN.categories[category];
      const legacyCategory = savedCategory as
        | (typeof savedCategory & {
            targetSessionsPerMonth?: unknown;
          })
        | undefined;
      result[category] = {
        targetSessions: normalizePlanCount(
          savedCategory?.targetSessions ??
            legacyCategory?.targetSessionsPerMonth,
          defaults.targetSessions
        ),
        cadence:
          savedCategory?.cadence === 'week' ||
          savedCategory?.cadence === 'month'
            ? savedCategory.cadence
            : 'month',
      };
      return result;
    },
    {} as TrainingPlanPreferences['categories']
  );

  return { categories };
}

export function normalizeSessionTypePreferences(
  value: unknown
): SessionTypePreferences {
  if (!value || typeof value !== 'object') {
    return { enabledCategories: [...DEFAULT_ENABLED_SESSION_CATEGORIES] };
  }

  const input = value as Partial<SessionTypePreferences>;
  const selected = Array.isArray(input.enabledCategories)
    ? input.enabledCategories.filter(
        (category): category is SessionCategory =>
          typeof category === 'string' &&
          SESSION_CATEGORIES.includes(category as SessionCategory)
      )
    : DEFAULT_ENABLED_SESSION_CATEGORIES;
  const enabled = new Set<SessionCategory>(['Technical', ...selected]);

  return {
    enabledCategories: SESSION_CATEGORIES.filter((category) =>
      enabled.has(category)
    ),
  };
}

function normalizeGitHubSettings(value: unknown): GitHubSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_GITHUB_SETTINGS };
  }

  const input = value as Partial<GitHubSettings>;
  const config =
    input.config && typeof input.config === 'object'
      ? {
          owner:
            typeof input.config.owner === 'string'
              ? input.config.owner.trim()
              : '',
          repo:
            typeof input.config.repo === 'string'
              ? input.config.repo.trim()
              : '',
          branch:
            typeof input.config.branch === 'string'
              ? input.config.branch.trim()
              : undefined,
        }
      : undefined;

  return {
    config: config && config.owner && config.repo ? config : undefined,
    enabled: input.enabled === true,
    migrationDone: input.migrationDone === true,
    lastSyncTime:
      typeof input.lastSyncTime === 'string' ? input.lastSyncTime : undefined,
    syncStatus:
      input.syncStatus === 'syncing' ||
      input.syncStatus === 'success' ||
      input.syncStatus === 'error'
        ? input.syncStatus
        : 'idle',
  };
}

function normalizeAuditConfig(value: unknown): AuditConfig {
  if (
    !value ||
    typeof value !== 'object' ||
    !('rules' in value) ||
    !Array.isArray((value as Record<string, unknown>).rules)
  ) {
    return {
      rules: DEFAULT_AUDIT_CONFIG.rules.map((rule) => ({ ...rule })),
    };
  }

  const input = value as Partial<AuditConfig>;
  const normalized = {
    rules: (input.rules || []).map((rule) => ({
      code:
        rule?.code &&
        [
          'no_techniques_high_effort',
          'empty_description',
          'empty_notes',
          'duration_outlier',
          'category_mismatch',
          'unsupported_technique_tags',
          'effort_conflict',
          'low_information',
          'missing_reflection',
        ].includes(rule.code)
          ? rule.code
          : 'no_techniques_high_effort',
      enabled: rule?.enabled !== false,
      ...(typeof rule?.effortThreshold === 'number'
        ? { effortThreshold: rule.effortThreshold }
        : {}),
      ...(typeof rule?.durationStdDevMultiplier === 'number'
        ? { durationStdDevMultiplier: rule.durationStdDevMultiplier }
        : {}),
    })),
  };
  return normalizeAuditConfigShape(normalized);
}

function normalizeAuditMode(value: unknown, config: AuditConfig): AuditMode {
  if (value === 'standard' || value === 'strict' || value === 'custom') {
    return value;
  }

  return areAuditConfigsEqual(config, DEFAULT_AUDIT_CONFIG)
    ? 'standard'
    : 'custom';
}

export function normalizeExpectedVideoCategories(
  value: unknown
): VideoLibraryPreferences['expectedVideoCategories'] {
  const categories = Array.isArray(value)
    ? value.filter(
        (
          category
        ): category is VideoLibraryPreferences['expectedVideoCategories'][number] =>
          typeof category === 'string' &&
          SESSION_CATEGORIES.includes(
            category as (typeof SESSION_CATEGORIES)[number]
          )
      )
    : [];

  if (categories.length === 0) {
    return [...DEFAULT_EXPECTED_VIDEO_CATEGORIES];
  }

  const order = new Map(
    SESSION_CATEGORIES.map((category, index) => [category, index])
  );
  return Array.from(new Set(categories)).sort(
    (left, right) =>
      (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
}

function normalizeVideoLibraryPreferences(
  value: unknown
): VideoLibraryPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_VIDEO_LIBRARY_PREFERENCES };
  }

  const input = value as Partial<VideoLibraryPreferences>;
  const customAllowedDomains = Array.isArray(input.customAllowedDomains)
    ? input.customAllowedDomains
        .filter((domain): domain is string => typeof domain === 'string')
        .map((domain) => domain.trim().toLowerCase())
        .filter((domain) => domain.length > 0)
    : [];

  const linkChecksBySessionId: Record<string, VideoLinkCheckSnapshot> = {};
  if (
    input.linkChecksBySessionId &&
    typeof input.linkChecksBySessionId === 'object'
  ) {
    for (const [sessionId, value] of Object.entries(
      input.linkChecksBySessionId
    )) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      const snapshot = value as Partial<VideoLinkCheckSnapshot>;
      if (
        typeof snapshot.url !== 'string' ||
        typeof snapshot.hostname !== 'string' ||
        typeof snapshot.status !== 'string' ||
        typeof snapshot.checkedAt !== 'string'
      ) {
        continue;
      }

      if (
        !['reachable', 'broken', 'disallowed_domain', 'check_failed'].includes(
          snapshot.status
        )
      ) {
        continue;
      }

      linkChecksBySessionId[sessionId] = {
        url: snapshot.url,
        hostname: snapshot.hostname,
        status: snapshot.status,
        checkedAt: snapshot.checkedAt,
        ...(typeof snapshot.httpStatus === 'number'
          ? { httpStatus: snapshot.httpStatus }
          : {}),
        ...(typeof snapshot.error === 'string'
          ? { error: snapshot.error }
          : {}),
      };
    }
  }

  return {
    customAllowedDomains: Array.from(new Set(customAllowedDomains)).sort(),
    linkChecksBySessionId,
    expectedVideoCategories: normalizeExpectedVideoCategories(
      input.expectedVideoCategories
    ),
  };
}

function normalizeSessionAudits(value: unknown): Record<string, SessionAudit> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const audits: Record<string, SessionAudit> = {};
  const input = value as Record<string, unknown>;

  for (const [sessionId, auditData] of Object.entries(input)) {
    if (
      auditData &&
      typeof auditData === 'object' &&
      'flags' in auditData &&
      Array.isArray((auditData as Record<string, unknown>).flags)
    ) {
      const audit = auditData as Partial<SessionAudit>;
      audits[sessionId] = {
        sessionId,
        flags: (audit.flags || []).map((flag) => ({
          code: flag?.code || 'no_techniques_high_effort',
          severity: ['info', 'warning', 'error'].includes(flag?.severity)
            ? (flag.severity as 'info' | 'warning' | 'error')
            : 'warning',
          message: typeof flag?.message === 'string' ? flag.message : '',
        })),
        reviewedAt:
          typeof audit.reviewedAt === 'string' ? audit.reviewedAt : undefined,
        ignoredRules: Array.isArray(audit.ignoredRules)
          ? audit.ignoredRules.filter((code) => typeof code === 'string')
          : [],
      };
    }
  }

  return audits;
}

export function normalizeLastAuditRun(
  value: unknown
): AuditRunResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const input = value as Partial<AuditRunResult>;

  if (!Array.isArray(input.sessions) || typeof input.ranAt !== 'string') {
    return undefined;
  }

  const normalizedSemanticAudit = normalizeSemanticAuditRunSummary(
    input.semanticAudit
  );

  return {
    sessions: input.sessions.map((session) => ({
      sessionId:
        typeof session?.sessionId === 'string' ? session.sessionId : '',
      sessionDate:
        typeof session?.sessionDate === 'string' ? session.sessionDate : '',
      flags: Array.isArray(session?.flags)
        ? session.flags.map((flag) => ({
            code: flag?.code || 'no_techniques_high_effort',
            severity: ['info', 'warning', 'error'].includes(flag?.severity)
              ? (flag.severity as 'info' | 'warning' | 'error')
              : 'warning',
            message: typeof flag?.message === 'string' ? flag.message : '',
          }))
        : [],
      reviewedAt:
        typeof session?.reviewedAt === 'string'
          ? session.reviewedAt
          : undefined,
      ignoredRules: Array.isArray(session?.ignoredRules)
        ? session.ignoredRules
        : [],
    })),
    ranAt: input.ranAt,
    ...(normalizedSemanticAudit
      ? { semanticAudit: normalizedSemanticAudit }
      : {}),
  };
}

function normalizeSemanticAuditRunSummary(
  value: unknown
): SemanticAuditRunSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const input = value as Record<string, unknown>;
  const status = input.status;
  const assessedSessions = input.assessedSessions;
  const failedSessions = input.failedSessions;
  if (
    (status !== 'complete' &&
      status !== 'partial' &&
      status !== 'unavailable' &&
      status !== 'disabled') ||
    typeof assessedSessions !== 'number' ||
    !Number.isInteger(assessedSessions) ||
    assessedSessions < 0 ||
    typeof failedSessions !== 'number' ||
    !Number.isInteger(failedSessions) ||
    failedSessions < 0
  ) {
    return undefined;
  }

  return { status, assessedSessions, failedSessions };
}

function normalizePreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') {
    return cloneDefaults();
  }

  const input = value as Partial<UserPreferences>;
  const normalizedAuditConfig = normalizeAuditConfig(input.auditConfig);

  return {
    transformerPrompt:
      typeof input.transformerPrompt === 'string' &&
      input.transformerPrompt.trim()
        ? input.transformerPrompt
        : DEFAULT_TRANSFORMER_PROMPT,
    gitHub: normalizeGitHubSettings(input.gitHub),
    videoLibrary: normalizeVideoLibraryPreferences(input.videoLibrary),
    migratedLocalSettingsAt:
      typeof input.migratedLocalSettingsAt === 'string'
        ? input.migratedLocalSettingsAt
        : undefined,
    sessionAudits: normalizeSessionAudits(input.sessionAudits),
    auditMode: normalizeAuditMode(
      (input as Record<string, unknown>).auditMode,
      normalizedAuditConfig
    ),
    auditConfig: normalizedAuditConfig,
    lastAuditRun: normalizeLastAuditRun(input.lastAuditRun),
    trainingPlan: normalizeTrainingPlanPreferences(input.trainingPlan),
    sessionTypes: normalizeSessionTypePreferences(input.sessionTypes),
  };
}

function readCachedPreferences(): UserPreferences {
  if (typeof window === 'undefined') {
    return cloneDefaults();
  }

  try {
    const stored = localStorage.getItem(
      getScopedStorageKey(PREFERENCES_CACHE_KEY)
    );
    return stored ? normalizePreferences(JSON.parse(stored)) : cloneDefaults();
  } catch (error) {
    console.error('Failed to parse cached user preferences', error);
    return cloneDefaults();
  }
}

function writeCachedPreferences(preferences: UserPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(
    getScopedStorageKey(PREFERENCES_CACHE_KEY),
    JSON.stringify(preferences)
  );
}

function readLegacyPreferences(): Partial<UserPreferences> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const prompt = localStorage.getItem(LEGACY_PROMPT_KEY);
    const gitHubRaw = localStorage.getItem(LEGACY_GITHUB_CONFIG_KEY);
    const gitHub = gitHubRaw
      ? normalizeGitHubSettings(JSON.parse(gitHubRaw))
      : undefined;

    if (!prompt && !gitHubRaw) {
      return null;
    }

    return {
      ...(prompt ? { transformerPrompt: prompt } : {}),
      ...(gitHub ? { gitHub } : {}),
    };
  } catch (error) {
    console.error('Failed to read legacy user preferences', error);
    return null;
  }
}

export function getCurrentPreferences(): UserPreferences {
  return currentPreferences;
}

export function subscribeToPreferences(
  listener: PreferencesListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function initializeUserPreferences(
  uid: string,
  options?: {
    shouldApply?: () => boolean;
  }
): Promise<UserPreferences> {
  if (loadedUserId === uid) {
    return currentPreferences;
  }

  loadedUserId = null;
  currentPreferencesRevision = 0;
  currentPreferences = readCachedPreferences();
  notifyPreferencesChanged();

  const stored = await requestPreferences<{
    preferences: unknown;
    revision: number;
  }>('/api/preferences');
  const remotePreferences = stored.preferences
    ? normalizePreferences(stored.preferences)
    : cloneDefaults();
  const legacyPreferences = readLegacyPreferences();

  const mergedPreferences = normalizePreferences({
    ...remotePreferences,
    ...(legacyPreferences && !remotePreferences.migratedLocalSettingsAt
      ? {
          ...remotePreferences,
          ...legacyPreferences,
          gitHub: legacyPreferences.gitHub ?? remotePreferences.gitHub,
          migratedLocalSettingsAt: new Date().toISOString(),
        }
      : {}),
  });

  if (options?.shouldApply && !options.shouldApply()) {
    return mergedPreferences;
  }

  currentPreferencesRevision = stored.revision;
  currentPreferences = mergedPreferences;
  writeCachedPreferences(mergedPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();

  if (options?.shouldApply && !options.shouldApply()) {
    return mergedPreferences;
  }
  loadedUserId = uid;

  return mergedPreferences;
}

export function clearUserPreferencesState(): void {
  currentPreferences = cloneDefaults();
  loadedUserId = null;
  currentPreferencesRevision = 0;
  notifyPreferencesChanged();
}

export async function saveTransformerPromptPreference(
  uid: string,
  prompt: string
): Promise<void> {
  currentPreferences = {
    ...currentPreferences,
    transformerPrompt: prompt,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

export async function resetTransformerPromptPreference(
  uid: string
): Promise<void> {
  await saveTransformerPromptPreference(uid, DEFAULT_TRANSFORMER_PROMPT);
}

export async function saveGitHubSettingsPreference(
  uid: string,
  gitHub: GitHubSettings
): Promise<void> {
  currentPreferences = {
    ...currentPreferences,
    gitHub,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

export async function saveVideoLibraryPreference(
  uid: string,
  videoLibrary: VideoLibraryPreferences
): Promise<void> {
  currentPreferences = {
    ...currentPreferences,
    videoLibrary: normalizeVideoLibraryPreferences(videoLibrary),
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

export async function saveTrainingPlanPreference(
  uid: string,
  trainingPlan: TrainingPlanPreferences
): Promise<void> {
  const normalizedPlan = normalizeTrainingPlanPreferences(trainingPlan);
  currentPreferences = {
    ...currentPreferences,
    trainingPlan: normalizedPlan,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

export async function saveSessionTypePreferences(
  uid: string,
  sessionTypes: SessionTypePreferences
): Promise<void> {
  const normalized = normalizeSessionTypePreferences(sessionTypes);
  currentPreferences = { ...currentPreferences, sessionTypes: normalized };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

export async function clearGitHubConfigPreference(_uid: string): Promise<void> {
  const nextGitHub = {
    ...DEFAULT_GITHUB_SETTINGS,
  };
  currentPreferences = {
    ...currentPreferences,
    gitHub: nextGitHub,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

/**
 * Audit Management
 */

export function getSessionAudit(sessionId: string): SessionAudit | undefined {
  return currentPreferences.sessionAudits?.[sessionId];
}

export async function saveSessionAudit(
  uid: string,
  sessionId: string,
  audit: SessionAudit
): Promise<void> {
  const audits = currentPreferences.sessionAudits || {};
  const updated = {
    ...audits,
    [sessionId]: audit,
  };

  currentPreferences = {
    ...currentPreferences,
    sessionAudits: updated,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

export function getAuditConfig(): AuditConfig {
  const mode = getAuditMode();
  if (mode === 'standard' || mode === 'strict') {
    return getAuditConfigPreset(mode);
  }
  return currentPreferences.auditConfig || DEFAULT_AUDIT_CONFIG;
}

export function getAuditMode(): AuditMode {
  const mode = currentPreferences.auditMode;
  if (mode === 'standard' || mode === 'strict' || mode === 'custom') {
    return mode;
  }
  return inferAuditModeFromConfig(getAuditConfig());
}

export async function saveAuditConfig(
  uid: string,
  config: AuditConfig,
  mode?: AuditMode
): Promise<void> {
  const normalizedConfig = normalizeAuditConfigShape(config);
  const nextMode = mode || inferAuditModeFromConfig(normalizedConfig);
  const configForMode =
    nextMode === 'custom' ? normalizedConfig : getAuditConfigPreset(nextMode);

  currentPreferences = {
    ...currentPreferences,
    auditMode: nextMode,
    auditConfig: configForMode,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}

export function getLastAuditRun(): AuditRunResult | undefined {
  return currentPreferences.lastAuditRun;
}

export async function saveLastAuditRun(
  uid: string,
  result: AuditRunResult
): Promise<void> {
  currentPreferences = {
    ...currentPreferences,
    lastAuditRun: result,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await persistCurrentPreferences();
}
