'use client';

import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { DEFAULT_TRANSFORMER_PROMPT } from './ai-prompts';
import { getFirebaseDb } from './firebase-client';
import { getScopedStorageKey } from './client-identity';
import type {
  AuditConfig,
  AuditMode,
  AuditRunResult,
  GitHubConfig,
  GitHubSettings,
  SessionAudit,
  UserPreferences,
  VideoLibraryPreferences,
  VideoLinkCheckSnapshot,
} from './types';
import {
  DEFAULT_AUDIT_CONFIG,
  DEFAULT_EXPECTED_VIDEO_CATEGORIES,
} from './types';
import {
  areAuditConfigsEqual,
  getAuditConfigPreset,
  inferAuditModeFromConfig,
  normalizeAuditConfigShape,
} from './audit-presets';

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

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  transformerPrompt: DEFAULT_TRANSFORMER_PROMPT,
  gitHub: DEFAULT_GITHUB_SETTINGS,
  videoLibrary: DEFAULT_VIDEO_LIBRARY_PREFERENCES,
  sessionAudits: {},
  auditMode: 'standard',
  auditConfig: DEFAULT_AUDIT_CONFIG,
  lastAuditRun: undefined,
};

type PreferencesListener = (preferences: UserPreferences) => void;

let currentPreferences: UserPreferences = DEFAULT_USER_PREFERENCES;
let loadedUserId: string | null = null;
const listeners = new Set<PreferencesListener>();

function getPreferencesDocRef(uid: string) {
  return doc(getFirebaseDb(), 'users', uid, 'preferences', 'app');
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

const SESSION_CATEGORIES = ['Technical', 'Randori', 'Shiai'] as const;

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

function normalizeLastAuditRun(value: unknown): AuditRunResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const input = value as Partial<AuditRunResult>;

  if (!Array.isArray(input.sessions) || typeof input.ranAt !== 'string') {
    return undefined;
  }

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
    })),
    ranAt: input.ranAt,
  };
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
  };
}

function serializeGitHubSettings(
  gitHub: GitHubSettings
): Record<string, unknown> {
  return {
    enabled: gitHub.enabled,
    migrationDone: gitHub.migrationDone,
    syncStatus: gitHub.syncStatus,
    ...(gitHub.config
      ? {
          config: {
            owner: gitHub.config.owner,
            repo: gitHub.config.repo,
            ...(gitHub.config.branch ? { branch: gitHub.config.branch } : {}),
          },
        }
      : {}),
    ...(gitHub.lastSyncTime ? { lastSyncTime: gitHub.lastSyncTime } : {}),
  };
}

function serializeVideoLibraryPreferences(
  videoLibrary: VideoLibraryPreferences
): Record<string, unknown> {
  return {
    customAllowedDomains: Array.from(
      new Set(
        videoLibrary.customAllowedDomains
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0)
      )
    ).sort(),
    linkChecksBySessionId: Object.fromEntries(
      Object.entries(videoLibrary.linkChecksBySessionId || {})
        .filter(([, snapshot]) => !!snapshot)
        .map(([sessionId, snapshot]) => [
          sessionId,
          {
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
          },
        ])
    ),
    expectedVideoCategories: normalizeExpectedVideoCategories(
      videoLibrary.expectedVideoCategories
    ),
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

  currentPreferences = readCachedPreferences();
  notifyPreferencesChanged();

  const snapshot = await getDoc(getPreferencesDocRef(uid));
  const remotePreferences = snapshot.exists()
    ? normalizePreferences(snapshot.data())
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

  currentPreferences = mergedPreferences;
  loadedUserId = uid;
  writeCachedPreferences(mergedPreferences);
  notifyPreferencesChanged();

  await setDoc(
    getPreferencesDocRef(uid),
    {
      transformerPrompt: mergedPreferences.transformerPrompt,
      gitHub: serializeGitHubSettings(mergedPreferences.gitHub),
      videoLibrary: serializeVideoLibraryPreferences(
        mergedPreferences.videoLibrary
      ),
      ...(mergedPreferences.migratedLocalSettingsAt
        ? { migratedLocalSettingsAt: mergedPreferences.migratedLocalSettingsAt }
        : {}),
      ...(mergedPreferences.sessionAudits &&
      Object.keys(mergedPreferences.sessionAudits).length > 0
        ? {
            sessionAudits: serializeSessionAudits(
              mergedPreferences.sessionAudits
            ),
          }
        : {}),
      ...(mergedPreferences.auditConfig
        ? { auditConfig: serializeAuditConfig(mergedPreferences.auditConfig) }
        : {}),
      ...(mergedPreferences.auditMode
        ? { auditMode: mergedPreferences.auditMode }
        : {}),
      ...(mergedPreferences.lastAuditRun
        ? {
            lastAuditRun: serializeLastAuditRun(mergedPreferences.lastAuditRun),
          }
        : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return mergedPreferences;
}

export function clearUserPreferencesState(): void {
  currentPreferences = cloneDefaults();
  loadedUserId = null;
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

  await setDoc(
    getPreferencesDocRef(uid),
    {
      transformerPrompt: prompt,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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

  await setDoc(
    getPreferencesDocRef(uid),
    {
      gitHub: serializeGitHubSettings(gitHub),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveGitHubConfigPreference(
  uid: string,
  config: GitHubConfig
): Promise<void> {
  await saveGitHubSettingsPreference(uid, {
    ...currentPreferences.gitHub,
    config,
    enabled: true,
  });
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

  await setDoc(
    getPreferencesDocRef(uid),
    {
      videoLibrary: serializeVideoLibraryPreferences(
        currentPreferences.videoLibrary
      ),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearGitHubConfigPreference(uid: string): Promise<void> {
  const nextGitHub = {
    ...DEFAULT_GITHUB_SETTINGS,
  };
  currentPreferences = {
    ...currentPreferences,
    gitHub: nextGitHub,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  await updateDoc(getPreferencesDocRef(uid), {
    gitHub: deleteField(),
    updatedAt: serverTimestamp(),
  }).catch(async () => {
    await setDoc(
      getPreferencesDocRef(uid),
      {
        gitHub: serializeGitHubSettings(nextGitHub),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Audit Management
 */

function serializeAuditConfig(config: AuditConfig): Record<string, unknown> {
  return {
    rules: config.rules.map((rule) => ({
      code: rule.code,
      enabled: rule.enabled,
      ...(typeof rule.effortThreshold === 'number'
        ? { effortThreshold: rule.effortThreshold }
        : {}),
      ...(typeof rule.durationStdDevMultiplier === 'number'
        ? { durationStdDevMultiplier: rule.durationStdDevMultiplier }
        : {}),
    })),
  };
}

function serializeSessionAudits(
  audits: Record<string, SessionAudit>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [sessionId, audit] of Object.entries(audits)) {
    result[sessionId] = {
      sessionId: audit.sessionId,
      flags: audit.flags.map((flag) => ({
        code: flag.code,
        severity: flag.severity,
        message: flag.message,
      })),
      ...(audit.reviewedAt ? { reviewedAt: audit.reviewedAt } : {}),
      ignoredRules: audit.ignoredRules,
    };
  }

  return result;
}

function serializeLastAuditRun(
  result: AuditRunResult
): Record<string, unknown> {
  return {
    sessions: result.sessions.map((session) => ({
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      flags: session.flags.map((flag) => ({
        code: flag.code,
        severity: flag.severity,
        message: flag.message,
      })),
    })),
    ranAt: result.ranAt,
  };
}

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

  await setDoc(
    getPreferencesDocRef(uid),
    {
      sessionAudits: serializeSessionAudits(updated),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteSessionAudit(
  uid: string,
  sessionId: string
): Promise<void> {
  const audits = { ...currentPreferences.sessionAudits };
  delete audits[sessionId];

  currentPreferences = {
    ...currentPreferences,
    sessionAudits: audits,
  };
  writeCachedPreferences(currentPreferences);
  notifyPreferencesChanged();

  // Update Firestore with the remaining audits or delete the field if empty
  if (Object.keys(audits).length === 0) {
    await updateDoc(getPreferencesDocRef(uid), {
      sessionAudits: deleteField(),
      updatedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(
        getPreferencesDocRef(uid),
        {
          sessionAudits: {},
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  } else {
    await setDoc(
      getPreferencesDocRef(uid),
      {
        sessionAudits: serializeSessionAudits(audits),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
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

  await setDoc(
    getPreferencesDocRef(uid),
    {
      auditMode: nextMode,
      auditConfig: serializeAuditConfig(configForMode),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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

  await setDoc(
    getPreferencesDocRef(uid),
    {
      lastAuditRun: serializeLastAuditRun(result),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
