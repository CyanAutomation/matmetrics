import ts from 'typescript';

import type { RequirementKey } from './validate-plugin-ui-contract';

export type ImportedPrimitive = {
  requirement: RequirementKey;
  localName: string;
};

const addNamedPrimitive = (
  imported: ImportedPrimitive[],
  source: string,
  importedName: string,
  localName: string
): void => {
  const pluginStateRequirements: Record<string, RequirementKey> = {
    PluginLoadingState: 'loadingState',
    PluginErrorState: 'errorState',
    PluginEmptyState: 'emptyState',
    PluginSuccessState: 'successState',
  };
  const requirement =
    source === '@/components/plugins/plugin-state'
      ? pluginStateRequirements[importedName]
      : source === '@/components/plugins/plugin-confirmation' &&
          importedName === 'PluginConfirmationDialog'
        ? 'destructiveConfirmation'
        : source === '@/components/plugins/plugin-destructive-action' &&
            importedName === 'PluginDestructiveAction'
          ? 'destructiveConfirmation'
          : source === '@/hooks/use-plugin-confirmation' &&
              importedName === 'usePluginConfirmation'
            ? 'destructiveConfirmation'
            : undefined;

  if (requirement) imported.push({ requirement, localName });
};

export const getImportedPrimitives = (
  sourceFile: ts.SourceFile
): ImportedPrimitive[] => {
  const imported: ImportedPrimitive[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleSpecifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

    for (const element of namedBindings.elements) {
      addNamedPrimitive(
        imported,
        moduleSpecifier.text,
        (element.propertyName ?? element.name).text,
        element.name.text
      );
    }
  }
  return imported;
};
