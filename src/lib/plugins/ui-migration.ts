import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

type PrimitiveKey =
  | 'sharedShell'
  | 'sharedState'
  | 'sharedDestructiveConfirmation';

export type PluginUiMigrationChecks = Record<PrimitiveKey, boolean>;

export type PluginUiMigrationRow = {
  id: string;
  entrypoint: string;
  uiEntrypoints: string[];
  checks: PluginUiMigrationChecks;
  score: number;
  maxScore: number;
  missing: PrimitiveKey[];
};

const pluginComponentImportPattern =
  /^import\s+\{?\s*([A-Za-z0-9_$]+)\s*\}?\s+from\s+['\"]([^'\"]+)['\"];?$/gm;

const createElementPattern = /React\.createElement\(\s*([A-Za-z][A-Za-z0-9_$]*)/g;

const relativePath = (repoRoot: string, targetPath: string): string =>
  path.relative(repoRoot, targetPath).split(path.sep).join('/');

const resolveModuleImport = async (
  importerPath: string,
  source: string,
  repoRoot: string
): Promise<string | null> => {
  const basePath = source.startsWith('@/')
    ? path.join(repoRoot, 'src', source.slice(2))
    : source.startsWith('.')
      ? path.resolve(path.dirname(importerPath), source)
      : null;

  if (!basePath) {
    return null;
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
  ];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // no-op
    }
  }

  return null;
};

const getUiEntrypoints = async (
  pluginEntryPath: string,
  repoRoot: string
): Promise<string[]> => {
  const entryContents = await readFile(pluginEntryPath, 'utf8');
  const importMap = new Map<string, string>();

  for (const match of entryContents.matchAll(pluginComponentImportPattern)) {
    const importName = match[1]?.trim();
    const source = match[2]?.trim();
    if (importName && source) {
      importMap.set(importName, source);
    }
  }

  const resolvedUiFiles = new Set<string>([pluginEntryPath]);

  for (const match of entryContents.matchAll(createElementPattern)) {
    const componentName = match[1];
    if (!componentName) {
      continue;
    }

    const importSource = importMap.get(componentName);
    if (!importSource) {
      continue;
    }

    const resolved = await resolveModuleImport(
      pluginEntryPath,
      importSource,
      repoRoot
    );
    if (resolved) {
      resolvedUiFiles.add(resolved);
    }
  }

  return [...resolvedUiFiles];
};

const sourceHasSharedShell = (contents: string): boolean =>
  /@\/components\/plugins\/plugin-page-shell/.test(contents) ||
  /<PluginPageShell\b/.test(contents);

const sourceHasSharedState = (contents: string): boolean =>
  /@\/components\/plugins\/plugin-state/.test(contents) ||
  /<Plugin(?:Loading|Error|Empty|Success)State\b/.test(contents);

const sourceHasSharedDestructiveConfirmation = (contents: string): boolean =>
  /@\/components\/plugins\/plugin-confirmation/.test(contents) ||
  /<PluginConfirmationDialog\b/.test(contents) ||
  /usePluginConfirmation\b/.test(contents);

const defaultChecks = (): PluginUiMigrationChecks => ({
  sharedShell: false,
  sharedState: false,
  sharedDestructiveConfirmation: false,
});

const scoreChecks = (checks: PluginUiMigrationChecks): number =>
  Object.values(checks).filter(Boolean).length;

export const scanPluginUiMigration = async (
  pluginsRoot = path.join(process.cwd(), 'plugins')
): Promise<PluginUiMigrationRow[]> => {
  const repoRoot = path.dirname(pluginsRoot);
  const pluginDirs = (await readdir(pluginsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const rows = await Promise.all(
    pluginDirs.map(async (pluginId) => {
      const entrypoint = path.join(pluginsRoot, pluginId, 'src', 'index.ts');
      const uiEntrypoints = await getUiEntrypoints(entrypoint, repoRoot);
      const checks = defaultChecks();

      for (const uiFile of uiEntrypoints) {
        const contents = await readFile(uiFile, 'utf8');
        checks.sharedShell ||= sourceHasSharedShell(contents);
        checks.sharedState ||= sourceHasSharedState(contents);
        checks.sharedDestructiveConfirmation ||=
          sourceHasSharedDestructiveConfirmation(contents);
      }

      const maxScore = 3;
      const score = scoreChecks(checks);
      const missing = (Object.entries(checks) as Array<[PrimitiveKey, boolean]>)
        .filter(([, met]) => !met)
        .map(([key]) => key);

      return {
        id: pluginId,
        entrypoint: relativePath(repoRoot, entrypoint),
        uiEntrypoints: uiEntrypoints.map((filePath) =>
          relativePath(repoRoot, filePath)
        ),
        checks,
        score,
        maxScore,
        missing,
      } satisfies PluginUiMigrationRow;
    })
  );

  return rows;
};
