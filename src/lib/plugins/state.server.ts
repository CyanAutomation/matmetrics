import { requestDataWorker } from '@/lib/data-worker-client.server';
export type PluginEnabledOverrides = Record<string, boolean>;

const TEST_PLUGIN_ENABLED_OVERRIDES = new Map<string, PluginEnabledOverrides>();

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

export const loadPluginEnabledOverrides = async (
  uid: string
): Promise<PluginEnabledOverrides> => {
  if (isTestMode()) {
    return { ...(TEST_PLUGIN_ENABLED_OVERRIDES.get(uid) ?? {}) };
  }

  const payload = await requestDataWorker<{
    overrides: PluginEnabledOverrides;
  }>('/v1/plugin-overrides', { method: 'GET', userId: uid });
  return normalizePluginEnabledOverrides(payload.overrides);
};

export const persistPluginEnabledOverride = async (
  uid: string,
  pluginId: string,
  enabled: boolean
): Promise<void> => {
  if (isTestMode()) {
    TEST_PLUGIN_ENABLED_OVERRIDES.set(uid, {
      ...(TEST_PLUGIN_ENABLED_OVERRIDES.get(uid) ?? {}),
      [pluginId]: enabled,
    });
    return;
  }

  await requestDataWorker('/v1/plugin-overrides', {
    method: 'PUT',
    userId: uid,
    body: { pluginId, enabled },
  });
};

export const resetPluginEnabledOverridesForTests = (): void => {
  TEST_PLUGIN_ENABLED_OVERRIDES.clear();
};
