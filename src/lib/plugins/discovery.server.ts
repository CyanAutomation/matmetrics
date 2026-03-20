import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  type DashboardTabExtension,
  type PluginManifest,
  type ResolvedDashboardTabExtension,
} from '@/lib/plugins/types';
import { validatePluginManifest } from '@/lib/plugins/validate';

type DiscoveryOptions = {
  pluginsRoot?: string;
  approvedManifestSources?: unknown[];
};

const isDashboardTabExtension = (
  extension: PluginManifest['uiExtensions'][number]
): extension is DashboardTabExtension => extension.type === 'dashboard_tab';

const loadFilesystemManifestCandidates = async (
  rootDir: string
): Promise<unknown[]> => {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          // Validate entry name to prevent path traversal
          if (entry.name.includes('..') || entry.name.includes('/') || entry.name.includes('\\')) {
            return null;
          }
          const manifestPath = path.join(rootDir, entry.name, 'plugin.json');
          try {
            const raw = await readFile(manifestPath, 'utf8');
            // Protect against DoS via extremely large manifest files
            if (raw.length > 1048576) { // 1MB limit
              return null;
            }
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })
    );

    return manifests.filter((manifest): manifest is unknown => manifest !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

export const discoverPluginManifestCandidates = async (
  options: DiscoveryOptions = {}
): Promise<unknown[]> => {
  const pluginsRoot = options.pluginsRoot ?? path.resolve(__dirname, '../../../../plugins');
  const filesystemCandidates = await loadFilesystemManifestCandidates(pluginsRoot);
  const approvedCandidates = options.approvedManifestSources ?? [];

  return [...filesystemCandidates, ...approvedCandidates];
};

export const discoverValidatedPluginManifests = async (
  options: DiscoveryOptions = {}
): Promise<PluginManifest[]> => {
  const candidates = await discoverPluginManifestCandidates(options);

  return candidates
    .map((candidate) => validatePluginManifest(candidate))
    .flatMap((result) => (result.isValid ? [result.manifest] : []));
};

export const discoverEnabledDashboardTabExtensions = async (
  options: DiscoveryOptions = {}
): Promise<ResolvedDashboardTabExtension[]> => {
  const manifests = await discoverValidatedPluginManifests(options);

  return manifests
    .filter((manifest) => manifest.enabled)
    .flatMap((manifest) =>
      manifest.uiExtensions
        .filter(isDashboardTabExtension)
        .map((extension) => ({
          pluginId: manifest.id,
          extension,
        }))
    );
};
