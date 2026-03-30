import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

type PluginManifest = {
  id: string;
  uiExtensions?: Array<{
    type?: string;
    config?: {
      component?: string;
    };
  }>;
  uiContract?: {
    requiredUxStates?: string[];
  };
};

type RequirementKey =
  | 'sharedShellOrSection'
  | 'loadingState'
  | 'errorState'
  | 'emptyState'
  | 'successState'
  | 'destructiveConfirmation';

type Violation = {
  pluginId: string;
  requirement: RequirementKey;
  sourcePath: string;
  details: string;
};

type PrimitiveUsage = Record<RequirementKey, boolean>;

type ImportedPrimitive = {
  requirement: RequirementKey;
  localName: string;
};

const repoRoot = process.cwd();
const pluginsRoot = path.join(repoRoot, 'plugins');

const requirementLabels: Record<RequirementKey, string> = {
  sharedShellOrSection:
    'Missing shared shell/section usage (PluginPageShell or PluginSectionCard)',
  loadingState: 'Missing required loading state helper (PluginLoadingState)',
  errorState: 'Missing required error state helper (PluginErrorState)',
  emptyState: 'Missing required empty state helper (PluginEmptyState)',
  successState: 'Missing required success state helper (PluginSuccessState)',
  destructiveConfirmation:
    'Missing required destructive confirmation helper (PluginConfirmationDialog, PluginDestructiveAction, or usePluginConfirmation)',
};

const stateRequirementMap: Record<string, RequirementKey> = {
  loading: 'loadingState',
  error: 'errorState',
  empty: 'emptyState',
  success: 'successState',
  destructive: 'destructiveConfirmation',
};

const relativePath = (targetPath: string): string =>
  path.relative(repoRoot, targetPath).split(path.sep).join('/');

const supportedExtensions = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

const resolveImportPath = async (
  importerPath: string,
  moduleSpecifier: string
): Promise<string | null> => {
  const basePath = moduleSpecifier.startsWith('@/')
    ? path.join(repoRoot, 'src', moduleSpecifier.slice(2))
    : moduleSpecifier.startsWith('.')
      ? path.resolve(path.dirname(importerPath), moduleSpecifier)
      : null;

  if (!basePath) {
    return null;
  }

  for (const extension of supportedExtensions) {
    const candidate = `${basePath}${extension}`;
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // Ignore unresolved candidates.
    }
  }

  return null;
};

const parseSourceFile = async (filePath: string): Promise<ts.SourceFile> => {
  const contents = await readFile(filePath, 'utf8');
  return ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true);
};

const getCallName = (expression: ts.LeftHandSideExpression): string | null => {
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  if (ts.isPropertyAccessChain(expression)) {
    return expression.name.text;
  }

  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  return null;
};

const extractRendererRootComponent = (node: ts.Expression): string | null => {
  const visit = (current: ts.Node): string | null => {
    if (ts.isCallExpression(current)) {
      const expressionText = current.expression.getText();
      if (
        expressionText === 'React.createElement' &&
        current.arguments.length > 0 &&
        ts.isIdentifier(current.arguments[0])
      ) {
        return current.arguments[0].text;
      }
    }

    return ts.forEachChild(current, visit) ?? null;
  };

  return visit(node);
};

const resolvePluginComponentEntrypoints = async (
  pluginIndexPath: string,
  componentIds: string[]
): Promise<Map<string, string>> => {
  const sourceFile = await parseSourceFile(pluginIndexPath);
  const importMap = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      continue;
    }

    const source = moduleSpecifier.text;
    const importClause = statement.importClause;
    if (!importClause) {
      continue;
    }

    if (importClause.name) {
      importMap.set(importClause.name.text, source);
    }

    const namedBindings = importClause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        importMap.set(
          (element.propertyName ?? element.name)?.text ?? '',
          source
        );
      }
    }
  }

  const requiredComponentIds = new Set(componentIds);
  const componentIdToIdentifier = new Map<string, string>();

  const visit = (node: ts.Node) => {
    if (!ts.isCallExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const callName = getCallName(node.expression);
    if (callName !== 'registerPluginComponent' || node.arguments.length < 2) {
      ts.forEachChild(node, visit);
      return;
    }

    const [idArg, rendererArg] = node.arguments;
    if (!ts.isStringLiteral(idArg) || !requiredComponentIds.has(idArg.text)) {
      ts.forEachChild(node, visit);
      return;
    }

    const componentIdentifier = extractRendererRootComponent(rendererArg);
    if (componentIdentifier) {
      componentIdToIdentifier.set(idArg.text, componentIdentifier);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  const resolved = new Map<string, string>();
  for (const [componentId, identifier] of componentIdToIdentifier.entries()) {
    const importSource = importMap.get(identifier);
    if (!importSource) {
      continue;
    }

    const importPath = await resolveImportPath(pluginIndexPath, importSource);
    if (importPath) {
      resolved.set(componentId, importPath);
    }
  }

  return resolved;
};

const getImportedPrimitives = (
  sourceFile: ts.SourceFile
): ImportedPrimitive[] => {
  const imported: ImportedPrimitive[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      continue;
    }

    const source = moduleSpecifier.text;
    const importClause = statement.importClause;
    if (
      !importClause?.namedBindings ||
      !ts.isNamedImports(importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of importClause.namedBindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      const localName = element.name.text;

      if (
        source === '@/components/plugins/plugin-page-shell' &&
        importedName === 'PluginPageShell'
      ) {
        imported.push({ requirement: 'sharedShellOrSection', localName });
      }

      if (
        source === '@/components/plugins/plugin-section-card' &&
        importedName === 'PluginSectionCard'
      ) {
        imported.push({ requirement: 'sharedShellOrSection', localName });
      }

      if (source === '@/components/plugins/plugin-state') {
        if (importedName === 'PluginLoadingState') {
          imported.push({ requirement: 'loadingState', localName });
        }
        if (importedName === 'PluginErrorState') {
          imported.push({ requirement: 'errorState', localName });
        }
        if (importedName === 'PluginEmptyState') {
          imported.push({ requirement: 'emptyState', localName });
        }
        if (importedName === 'PluginSuccessState') {
          imported.push({ requirement: 'successState', localName });
        }
      }

      if (
        source === '@/components/plugins/plugin-confirmation' &&
        importedName === 'PluginConfirmationDialog'
      ) {
        imported.push({ requirement: 'destructiveConfirmation', localName });
      }

      if (
        source === '@/components/plugins/plugin-destructive-action' &&
        importedName === 'PluginDestructiveAction'
      ) {
        imported.push({ requirement: 'destructiveConfirmation', localName });
      }

      if (
        source === '@/hooks/use-plugin-confirmation' &&
        importedName === 'usePluginConfirmation'
      ) {
        imported.push({ requirement: 'destructiveConfirmation', localName });
      }
    }
  }

  return imported;
};

const collectLocalImports = async (
  filePath: string,
  sourceFile: ts.SourceFile
): Promise<string[]> => {
  const results: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const resolved = await resolveImportPath(
      filePath,
      statement.moduleSpecifier.text
    );
    if (resolved) {
      results.push(resolved);
    }
  }

  return results;
};

const computePrimitiveUsage = async (
  componentEntryPath: string
): Promise<PrimitiveUsage> => {
  const usage: PrimitiveUsage = {
    sharedShellOrSection: false,
    loadingState: false,
    errorState: false,
    emptyState: false,
    successState: false,
    destructiveConfirmation: false,
  };

  const queue = [componentEntryPath];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    let sourceFile: ts.SourceFile;
    try {
      sourceFile = await parseSourceFile(current);
    } catch {
      continue;
    }

    const importedPrimitives = getImportedPrimitives(sourceFile);
    const primitiveLocals = new Map<string, RequirementKey>();
    for (const imported of importedPrimitives) {
      primitiveLocals.set(imported.localName, imported.requirement);
    }

    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        if (ts.isIdentifier(node.tagName)) {
          const requirement = primitiveLocals.get(node.tagName.text);
          if (requirement) {
            usage[requirement] = true;
          }
        }
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const requirement = primitiveLocals.get(node.expression.text);
        if (requirement) {
          usage[requirement] = true;
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    const imports = await collectLocalImports(current, sourceFile);
    for (const importedPath of imports) {
      if (!visited.has(importedPath)) {
        queue.push(importedPath);
      }
    }
  }

  return usage;
};

const readPluginManifest = async (
  manifestPath: string
): Promise<PluginManifest> => {
  const content = await readFile(manifestPath, 'utf8');
  return JSON.parse(content) as PluginManifest;
};

const validate = async (): Promise<Violation[]> => {
  const violations: Violation[] = [];
  const pluginDirs = (await readdir(pluginsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const pluginDir of pluginDirs) {
    const manifestPath = path.join(pluginsRoot, pluginDir, 'plugin.json');
    const pluginIndexPath = path.join(
      pluginsRoot,
      pluginDir,
      'src',
      'index.ts'
    );

    let manifest: PluginManifest;
    try {
      manifest = await readPluginManifest(manifestPath);
    } catch (error) {
      violations.push({
        pluginId: pluginDir,
        requirement: 'sharedShellOrSection',
        sourcePath: relativePath(manifestPath),
        details: `Unable to read plugin manifest: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const componentIds = (manifest.uiExtensions ?? [])
      .filter((extension) => extension.type === 'dashboard_tab')
      .map((extension) => extension.config?.component)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      );

    if (componentIds.length === 0) {
      continue;
    }

    const componentEntrypoints = await resolvePluginComponentEntrypoints(
      pluginIndexPath,
      componentIds
    );

    const requiredChecks = new Set<RequirementKey>(['sharedShellOrSection']);
    for (const state of manifest.uiContract?.requiredUxStates ?? []) {
      const requirement = stateRequirementMap[state];
      if (requirement) {
        requiredChecks.add(requirement);
      }
    }

    for (const componentId of componentIds) {
      const entry = componentEntrypoints.get(componentId);
      if (!entry) {
        violations.push({
          pluginId: manifest.id,
          requirement: 'sharedShellOrSection',
          sourcePath: relativePath(pluginIndexPath),
          details: `Unable to resolve dashboard component \"${componentId}\" from registerPluginComponent call in plugin entrypoint`,
        });
        continue;
      }

      const usage = await computePrimitiveUsage(entry);
      for (const requirement of requiredChecks) {
        if (!usage[requirement]) {
          violations.push({
            pluginId: manifest.id,
            requirement,
            sourcePath: relativePath(entry),
            details: requirementLabels[requirement],
          });
        }
      }
    }
  }

  return violations.sort((a, b) => {
    if (a.pluginId !== b.pluginId) {
      return a.pluginId.localeCompare(b.pluginId);
    }

    if (a.sourcePath !== b.sourcePath) {
      return a.sourcePath.localeCompare(b.sourcePath);
    }

    return a.requirement.localeCompare(b.requirement);
  });
};

const main = async () => {
  const violations = await validate();

  if (violations.length === 0) {
    console.log('✅ Plugin UI contract validation passed.');
    return;
  }

  console.error('❌ Plugin UI contract validation failed.');
  for (const violation of violations) {
    console.error(
      `- plugin=${violation.pluginId} requirement=${violation.requirement} source=${violation.sourcePath}`
    );
    console.error(`  ${violation.details}`);
  }

  process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
