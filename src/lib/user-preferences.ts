'use client';

import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebase-client';
import { getScopedStorageKey } from './client-identity';
import type { GitHubConfig, GitHubSettings, UserPreferences } from './types';

const LEGACY_PROMPT_KEY = 'matmetrics_transformer_prompt';
const LEGACY_GITHUB_CONFIG_KEY = 'matmetrics_github_config';
const PREFERENCES_CACHE_KEY = 'matmetrics_user_preferences';

export const DEFAULT_TRANSFORMER_PROMPT = `You are an experienced Judo practitioner helping a student write their training diary.

Your task is to take the following raw, informal notes from a Judo practice session and transform them into a well-structured, clear, and terminologically accurate diary entry.

Guidelines:
- **Tone**: Use an informal, personal, and reflective tone. It should feel like a student writing in their own training diary. Avoid being overly optimistic, buoyant, or exaggerated; maintain a neutral and realistic perspective on the session.
- **Terminology**: Use official Kodokan Judo terminology. Crucially, all techniques MUST be correctly hyphenated (e.g., "O-soto-gari", "Ippon-seoi-nage", "Uchi-mata", "Kuzushi"). Ensure correct spelling and capitalization according to Kodokan standards.
- **Content**: Maintain all specific details and meaning provided by the user.
- **Structure**: Organize the notes so they flow logically. If the input is just a list, turn it into a few readable, reflective sentences.
- **Focus**: Emphasize the specific techniques practiced and the trainee's honest reflections on what went well or what needs work.`;

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  enabled: false,
  migrationDone: false,
  syncStatus: 'idle',
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  transformerPrompt: DEFAULT_TRANSFORMER_PROMPT,
  gitHub: DEFAULT_GITHUB_SETTINGS,
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

function normalizePreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') {
    return cloneDefaults();
  }

  const input = value as Partial<UserPreferences>;

  return {
    transformerPrompt:
      typeof input.transformerPrompt === 'string' &&
      input.transformerPrompt.trim()
        ? input.transformerPrompt
        : DEFAULT_TRANSFORMER_PROMPT,
    gitHub: normalizeGitHubSettings(input.gitHub),
    migratedLocalSettingsAt:
      typeof input.migratedLocalSettingsAt === 'string'
        ? input.migratedLocalSettingsAt
        : undefined,
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
      ...(mergedPreferences.migratedLocalSettingsAt
        ? { migratedLocalSettingsAt: mergedPreferences.migratedLocalSettingsAt }
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
