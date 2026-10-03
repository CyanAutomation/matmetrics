import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const pageUrl = new URL('./page.tsx', import.meta.url);

test('dashboard page remains a single, syntactically complete module', async () => {
  let source: string;
  try {
    source = await readFile(pageUrl, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read dashboard page at ${pageUrl.href}`, {
      cause: error,
    });
  }

  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'page.tsx',
    reportDiagnostics: true,
  });

  const syntaxErrors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );

  assert.deepEqual(
    syntaxErrors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    ),
    []
  );

  const sourceFile = ts.createSourceFile(
    'page.tsx',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX
  );
  const useClientDirectives = sourceFile.statements.filter(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === 'use client'
  );
  const defaultHomeDeclarations = sourceFile.statements.filter(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'Home' &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword
      ) &&
      statement.modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      )
  );

  assert.equal(useClientDirectives.length, 1);
  assert.equal(defaultHomeDeclarations.length, 1);
});
