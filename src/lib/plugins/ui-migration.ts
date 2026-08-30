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
  status: 'migrated' | 'partially-migrated' | 'malformed' | 'absent-entrypoint';
  diagnostics: string[];
};

const pluginComponentImportPattern =
  /^import\s+([A-Za-z0-9_$]+)?(?:\s*,\s*)?(?:\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"];?$/gm;

const createElementPattern =
  /React\.createElement\(\s*([A-Za-z][A-Za-z0-9_$]*)/g;

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

const normalizeImportedName = (value: string): string =>
  value
    .trim()
    .replace(/^type\s+/, '')
    .split(/\s+as\s+/)[0]
    .trim();

const getUiEntrypoints = async (
  pluginEntryPath: string,
  repoRoot: string
): Promise<{ files: string[]; diagnostics: string[] }> => {
  const entryContents = await readFile(pluginEntryPath, 'utf8');
  const importMap = new Map<string, string>();

  for (const match of entryContents.matchAll(pluginComponentImportPattern)) {
    const defaultImport = match[1]?.trim();
    const namedImports = match[2]?.trim();
    const source = match[3]?.trim();

    if (!source) {
      continue;
    }

    if (namedImports) {
      const names = namedImports.split(',').map(normalizeImportedName);
      for (const importName of names) {
        if (importName) {
          importMap.set(importName, source);
        }
      }
    }

    if (defaultImport) {
      importMap.set(normalizeImportedName(defaultImport), source);
    }
  }

  const resolvedUiFiles = new Set<string>([pluginEntryPath]);
  const diagnostics: string[] = [];

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
    } else {
      diagnostics.push(
        `UI component "${componentName}" import "${importSource}" could not be resolved.`
      );
    }
  }

  return { files: [...resolvedUiFiles], diagnostics };
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
      let uiEntrypoints: string[];
      let diagnostics: string[];
      try {
        const result = await getUiEntrypoints(entrypoint, repoRoot);
        uiEntrypoints = result.files;
        diagnostics = result.diagnostics;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          id: pluginId,
          entrypoint: relativePath(repoRoot, entrypoint),
          uiEntrypoints: [],
          checks: defaultChecks(),
          score: 0,
          maxScore: 3,
          missing: Object.keys(defaultChecks()) as PrimitiveKey[],
          status: 'absent-entrypoint',
          diagnostics: [`Plugin entrypoint could not be read: ${message}`],
        } satisfies PluginUiMigrationRow;
      }
      const checks = defaultChecks();

      for (const uiFile of uiEntrypoints) {
        let contents: string;
        try {
          contents = await readFile(uiFile, 'utf8');
        } catch (error) {
          diagnostics.push(
            `UI entrypoint "${relativePath(repoRoot, uiFile)}" could not be read: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          continue;
        }
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
        status:
          diagnostics.length > 0
            ? 'malformed'
            : score === maxScore
              ? 'migrated'
              : 'partially-migrated',
        diagnostics,
      } satisfies PluginUiMigrationRow;
    })
  );

  return rows;
};
