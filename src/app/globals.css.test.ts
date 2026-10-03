import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('globals.css declares Tailwind config and reference directives', () => {
  const cssPath = path.join(process.cwd(), 'src/app/globals.css');
  const css = readFileSync(cssPath, 'utf8');

  assert.match(css, /^@config "..\/..\/tailwind\.config\.ts";/m);
  assert.match(css, /^@reference "tailwindcss";/m);
  assert.ok(css.includes('@tailwind base;'), 'expected @tailwind base; to be present');

  const configIndex = css.indexOf('@config "../../tailwind.config.ts";');
  const referenceIndex = css.indexOf('@reference "tailwindcss";');
  const tailwindBaseIndex = css.indexOf('@tailwind base;');

  assert.ok(configIndex >= 0, 'expected @config directive to be present');
  assert.ok(referenceIndex >= 0, 'expected @reference directive to be present');
  assert.ok(tailwindBaseIndex >= 0, 'expected @tailwind base; directive to be present');
  assert.ok(
    configIndex < tailwindBaseIndex,
  );
  assert.ok(referenceIndex < tailwindBaseIndex);
});
