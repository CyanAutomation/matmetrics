import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('globals.css declares Tailwind config and reference directives', () => {
  const cssPath = path.join(process.cwd(), 'src/app/globals.css');
  const css = readFileSync(cssPath, 'utf8');

  assert.match(css, /^@config "..\/..\/tailwind\.config\.ts";/m);
  assert.match(css, /^@reference "tailwindcss";/m);
  assert.ok(
    css.indexOf('@config "../../tailwind.config.ts";') <
      css.indexOf('@tailwind base;'),
  );
  assert.ok(css.indexOf('@reference "tailwindcss";') < css.indexOf('@tailwind base;'));
});
