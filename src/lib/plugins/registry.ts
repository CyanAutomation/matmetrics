import tagManagerPluginManifest from '../../../plugins/tag-manager/plugin.json';

import { validatePluginManifest } from '@/lib/plugins/validate';
import {
  type DashboardTabExtension,
  type PluginManifest,
  type ResolvedDashboardTabExtension,
} from '@/lib/plugins/types';

const localPluginManifestSources: unknown[] = [tagManagerPluginManifest];

export const getLocalPluginManifestCandidates = (): unknown[] =>
  localPluginManifestSources;

export const loadPluginManifests = (): PluginManifest[] =>
  getLocalPluginManifestCandidates()
    .map((candidate) => validatePluginManifest(candidate))
    .flatMap((result) => (result.isValid ? [result.manifest] : []));

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
            extension,
          }))
      );
