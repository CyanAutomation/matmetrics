import {
  loadPluginManifests,
  updatePluginEnabledState,
} from '@/lib/plugins/registry';

const getEnabledStateOrThrow = (pluginId: string): boolean => {
  const manifest = loadPluginManifests().find(
    (candidate) => candidate.id === pluginId
  );

  if (!manifest) {
    throw new Error(`Plugin ${pluginId} not found.`);
  }

  return manifest.enabled;
};

export const createPluginEnabledStateIsolation = () => {
  const originalEnabledStateByPluginId = new Map<string, boolean>();

  return {
    async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
      if (!originalEnabledStateByPluginId.has(pluginId)) {
        originalEnabledStateByPluginId.set(
          pluginId,
          getEnabledStateOrThrow(pluginId)
        );
      }

      await updatePluginEnabledState(pluginId, enabled);
    },
    async restoreTouchedPluginStates(): Promise<void> {
      await Promise.all(
        Array.from(originalEnabledStateByPluginId.entries()).map(
          async ([pluginId, enabled]) =>
            updatePluginEnabledState(pluginId, enabled)
        )
      );
      originalEnabledStateByPluginId.clear();
    },
  };
};
