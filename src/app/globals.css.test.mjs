import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import test from 'node:test';

test('Tailwind v4 compiles the global entrypoint and scans app and plugin sources', async () => {
  const cssPath = path.join(process.cwd(), 'src/app/globals.css');
  const source = await readFile(cssPath, 'utf8');
  const result = await postcss([tailwindcss()]).process(source, {
    from: cssPath,
  });

  assert.match(result.css, /box-sizing:\s*border-box;/);
  assert.match(result.css, /\.flex\s*\{[^}]*display:\s*flex;/);
  assert.match(result.css, /\.bg-background\s*\{[^}]*background-color:/);
  assert.match(result.css, /\.text-foreground\s*\{[^}]*color:/);
  assert.match(result.css, /\.bg-chart-5\s*\{[^}]*background-color:/);
  assert.match(result.css, /aspect-ratio:\s*2\s*\/\s*1;/);
});
