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
  assert.match(result.css, /@keyframes enter\s*\{/);
  assert.match(result.css, /@keyframes exit\s*\{/);
  assert.match(result.css, /--tw-enter-opacity:\s*0(?:;|\s)/);
  assert.match(result.css, /--tw-exit-opacity:\s*0\.8(?:;|\s)/);
  assert.match(result.css, /--tw-enter-scale:\s*0?\.95(?:;|\s)/);
  assert.match(result.css, /--tw-enter-translate-y:/);
  assert.match(result.css, /--tw-exit-translate-y:/);
  assert.match(
    result.css,
    /\.dialog-enter-from-top\s*\{[^}]*--tw-enter-translate-y:\s*-48%;/
  );
  assert.match(
    result.css,
    /\.animate-duration-500\s*\{[^}]*animation-duration:\s*500ms;/
  );
});
