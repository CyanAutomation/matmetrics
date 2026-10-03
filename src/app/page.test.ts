import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const pageUrl = new URL('./page.tsx', import.meta.url);

test('dashboard page remains a single, syntactically complete module', async () => {
  const source = await readFile(pageUrl, 'utf8');
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
  assert.equal(source.match(/^'use client';$/gm)?.length, 1);
  assert.equal(source.match(/^export default function Home\(\) \{$/gm)?.length, 1);
});
