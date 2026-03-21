import tagManagerPluginManifest from '../../../plugins/tag-manager/plugin.json';

import { validatePluginManifest } from '@/lib/plugins/validate';
import {
  type DashboardTabExtension,
  type PluginManifest,
  type ResolvedDashboardTabExtension,
} from '@/lib/plugins/types';

const localPluginManifestSources: unknown[] = [tagManagerPluginManifest];
const pluginEnabledOverrides = new Map<string, boolean>();
const pluginRegistryListeners = new Set<() => void>();
let pluginRegistryRevision = 0;

const notifyPluginRegistryListeners = () => {
  pluginRegistryRevision += 1;
  pluginRegistryListeners.forEach((listener) => listener());
};

const applyEnabledOverride = (manifest: PluginManifest): PluginManifest => {
  const enabledOverride = pluginEnabledOverrides.get(manifest.id);
  if (enabledOverride === undefined) {
    return manifest;
  }

  return {
    ...manifest,
    enabled: enabledOverride,
  };
};

export const getPluginRegistryRevision = (): number => pluginRegistryRevision;

export const subscribePluginRegistry = (listener: () => void): (() => void) => {
  pluginRegistryListeners.add(listener);
  return () => {
    pluginRegistryListeners.delete(listener);
  };
};

export const getLocalPluginManifestCandidates = (): unknown[] =>
  localPluginManifestSources;

export const loadPluginManifests = (): PluginManifest[] =>
  getLocalPluginManifestCandidates()
    .map((candidate) => validatePluginManifest(candidate))
    .flatMap((result) =>
      result.isValid ? [applyEnabledOverride(result.manifest)] : []
    );

export const updatePluginEnabledState = async (
  pluginId: string,
  enabled: boolean
): Promise<PluginManifest> => {
  const manifest = loadPluginManifests().find(
    (candidate) => candidate.id === pluginId
  );

  if (!manifest) {
    throw new Error(`Plugin ${pluginId} not found.`);
  }

  pluginEnabledOverrides.set(pluginId, enabled);
  notifyPluginRegistryListeners();

  return {
    ...manifest,
    enabled,
  };
};

const isDashboardTabExtension = (
  extension: PluginManifest['uiExtensions'][number]
): extension is DashboardTabExtension => extension.type === 'dashboard_tab';

export const loadEnabledDashboardTabExtensions =
  (): ResolvedDashboardTabExtension[] =>
    loadPluginManifests()
      .filter((manifest) => manifest.enabled)
      .flatMap((manifest) =>
        manifest.uiExtensions
          .filter(isDashboardTabExtension)
          .map((extension) => ({
            pluginId: manifest.id,
            capabilities: manifest.capabilities ?? [],
            extension,
          }))
      );
