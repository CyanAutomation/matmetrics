import path from 'node:path';

import { APP_VERSION } from '@/lib/app-version';
import { validatePluginManifest } from '@/lib/plugins/validate';
import type { PluginValidationIssue } from '@/lib/plugins/types';
type JsonRecord = Record<string, unknown>;

export type FileChangeType = 'added' | 'modified' | 'unchanged';

export type PluginApiContractPayload = {
  fileTreeDiffSummary: {
    mode: 'dry-run' | 'applied';
    files: Array<{
      path: string;
      changeType: FileChangeType;
    }>;
  };
  validationTable: {
    isValid: boolean;
    rows: PluginValidationIssue[];
  };
  assumptions: string[];
  unresolvedInputs: string[];
};

export type StoredPluginManifest = {
  manifest: JsonRecord;
  absolutePath: string;
  relativePath: string;
  directoryName: string;
};

type ValidationTableOptions = {
  validateDeclaredComponentsAtRuntime?: boolean;
};

const isObjectRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getPluginsRoot = (): string => path.join(process.cwd(), 'plugins');

const toRelativeRepoPath = (absolutePath: string): string =>
  path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');

export const listStoredPluginManifests = async (): Promise<
  StoredPluginManifest[]
> => {
  const pluginsRoot = getPluginsRoot();
  const entries = await (async () => {
    try {
      return await readdir(pluginsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  })();
  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const absolutePath = path.join(pluginsRoot, entry.name, 'plugin.json');
        try {
          const raw = await readFile(absolutePath, 'utf8');
          const parsed = JSON.parse(raw) as unknown;
          if (!isObjectRecord(parsed)) {
            return null;
          }

          return {
            manifest: parsed,
            absolutePath,
            relativePath: toRelativeRepoPath(absolutePath),
            directoryName: entry.name,
          } satisfies StoredPluginManifest;
        } catch {
          return null;
        }
      })
  );

  return manifests.filter(
    (manifest): manifest is StoredPluginManifest => !!manifest
  );
};

export const findStoredPluginManifestById = async (
  pluginId: string
): Promise<StoredPluginManifest | null> => {
  const manifests = await listStoredPluginManifests();
  return (
    manifests.find(
      (entry) =>
        typeof entry.manifest.id === 'string' && entry.manifest.id === pluginId
    ) ?? null
  );
};

export const toValidationTable = (
  manifest: unknown,
  options: ValidationTableOptions = {}
) => {
  const result = validatePluginManifest(manifest, {
    currentVersion: APP_VERSION,
    validateDeclaredComponentsAtRuntime:
      options.validateDeclaredComponentsAtRuntime ?? false,
  });
  return {
    isValid: result.isValid,
    rows: result.issues,
  };
};

/**
 * Auto-disables plugins with capability or version validation issues.
 * Returns a modified manifest with enabled: false if there are critical warnings.
 */
export const autoDisablePluginIfNeeded = (
  manifest: unknown
): { manifest: unknown; autoDisabledWithWarnings?: string[] } => {
  if (!isObjectRecord(manifest)) {
    return { manifest };
  }

  const result = validatePluginManifest(manifest, {
    currentVersion: APP_VERSION,
    validateDeclaredComponentsAtRuntime: false,
  });

  // Check if there are capability or version warnings
  const criticalWarnings = result.issues.filter(
    (issue) =>
      issue.severity === 'warning' &&
      (issue.message.includes('requires capability') ||
        issue.message.includes('requires matmetrics version'))
  );

  if (criticalWarnings.length > 0 && manifest.enabled !== false) {
    return {
      manifest: {
        ...manifest,
        enabled: false,
      },
      autoDisabledWithWarnings: criticalWarnings.map((w) => w.message),
    };
  }

  return { manifest };
};

export const createContractPayload = (
  payload: Partial<PluginApiContractPayload>
): PluginApiContractPayload => ({
  fileTreeDiffSummary: payload.fileTreeDiffSummary ?? {
    mode: 'dry-run',
    files: [],
  },
  validationTable: payload.validationTable ?? { isValid: true, rows: [] },
  assumptions: payload.assumptions ?? [],
  unresolvedInputs: payload.unresolvedInputs ?? [],
});
