import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

const isObjectRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getPluginsRoot = (): string => path.join(process.cwd(), 'plugins');

export const toRelativeRepoPath = (absolutePath: string): string =>
  path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');

export const listStoredPluginManifests = async (): Promise<
  StoredPluginManifest[]
> => {
  const pluginsRoot = getPluginsRoot();
  const entries = await readdir(pluginsRoot, { withFileTypes: true });
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

  return manifests.filter((manifest): manifest is StoredPluginManifest => !!manifest);
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

export const toValidationTable = (manifest: unknown) => {
  const result = validatePluginManifest(manifest);
  return {
    isValid: result.isValid,
    rows: result.issues,
  };
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

export const mergePreserveUnknownKeys = (
  base: unknown,
  update: unknown
): unknown => {
  if (update === undefined) {
    return base;
  }

  if (!isObjectRecord(base) || !isObjectRecord(update)) {
    return update;
  }

  const merged: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(update)) {
    merged[key] = mergePreserveUnknownKeys(base[key], value);
  }

  return merged;
};

export const writePluginManifest = async (
  absolutePath: string,
  manifest: unknown
): Promise<void> => {
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(absolutePath, serialized, 'utf8');
};

export const toPluginDirectoryName = (pluginId: string): string =>
  pluginId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'plugin';
