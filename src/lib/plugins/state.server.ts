import {
  getFirebaseAdminDb,
  isFirebaseAdminConfigured,
} from '@/lib/firebase-admin';
export type PluginEnabledOverrides = Record<string, boolean>;

const PLUGIN_CONFIG_COLLECTION = 'app';
const PLUGIN_CONFIG_DOCUMENT = 'pluginConfig';
const TEST_PLUGIN_ENABLED_OVERRIDES = new Map<string, boolean>();

const isTestMode = (): boolean =>
  process.env.MATMETRICS_AUTH_TEST_MODE === 'true';

const normalizePluginEnabledOverrides = (
  value: unknown
): PluginEnabledOverrides => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const overrides: PluginEnabledOverrides = {};
  for (const [pluginId, enabled] of Object.entries(value)) {
    if (typeof enabled === 'boolean') {
      overrides[pluginId] = enabled;
    }
  }

  return overrides;
};

export const applyPluginEnabledOverrides = (
  manifest: unknown,
  overrides: PluginEnabledOverrides
): unknown => {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return manifest;
  }

  const candidate = manifest as { id?: unknown };
  if (typeof candidate.id !== 'string') {
    return manifest;
  }

  const enabledOverride = overrides[candidate.id];
  if (enabledOverride === undefined) {
    return manifest;
  }

  return {
    ...manifest,
    enabled: enabledOverride,
  };
};

export const loadPluginEnabledOverrides =
  async (): Promise<PluginEnabledOverrides> => {
    if (isTestMode()) {
      return Object.fromEntries(TEST_PLUGIN_ENABLED_OVERRIDES);
    }

    if (!isFirebaseAdminConfigured()) {
      return {};
    }

    const snapshot = await getFirebaseAdminDb()
      .collection(PLUGIN_CONFIG_COLLECTION)
      .doc(PLUGIN_CONFIG_DOCUMENT)
      .get();

    if (!snapshot.exists) {
      return {};
    }

    const data = snapshot.data();
    return normalizePluginEnabledOverrides(data?.enabledOverrides);
  };

export const persistPluginEnabledOverride = async (
  pluginId: string,
  enabled: boolean
): Promise<void> => {
  if (isTestMode()) {
    TEST_PLUGIN_ENABLED_OVERRIDES.set(pluginId, enabled);
    return;
  }

  if (!isFirebaseAdminConfigured()) {
    throw new Error(
      'Plugin state persistence is unavailable because Firebase admin is not configured.'
    );
  }

  await getFirebaseAdminDb()
    .collection(PLUGIN_CONFIG_COLLECTION)
    .doc(PLUGIN_CONFIG_DOCUMENT)
    .set(
      {
        enabledOverrides: {
          [pluginId]: enabled,
        },
      },
      { merge: true }
    );
};

export const resetPluginEnabledOverridesForTests = (): void => {
  TEST_PLUGIN_ENABLED_OVERRIDES.clear();
};
