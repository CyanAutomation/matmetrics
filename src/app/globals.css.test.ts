import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPostCssPlugins } from 'next/dist/build/webpack/config/blocks/css/plugins.js';
import { findConfig, findConfigPath } from 'next/dist/lib/find-config.js';
import postcss, { type AcceptedPlugin } from 'postcss';
import test from 'node:test';

test('Next can discover the Tailwind PostCSS config used by production builds', async () => {
  const configPath = await findConfigPath(process.cwd(), 'postcss');
  const config = await findConfig<{ plugins: Record<string, unknown> }>(
    process.cwd(),
    'postcss'
  );

  assert.ok(
    configPath,
    'Next must find the Tailwind PostCSS config so production styles include utility classes'
  );
  assert.match(configPath, /postcss\.config\.(?:mjs|js|cjs)$/);
  assert.ok(
    config?.plugins?.['@tailwindcss/postcss'],
    'the discovered Next config must enable the Tailwind PostCSS plugin'
  );
});

test('[req:docs/blueprint.md#dashboard-session-category-chart-palette] Tailwind compiles base styles, semantic utilities, and all category chart colors', async () => {
  const cssPath = path.join(process.cwd(), 'src/app/globals.css');
  const source = await readFile(cssPath, 'utf8');
  const plugins = await getPostCssPlugins(process.cwd(), undefined);
  const result = await postcss(plugins as unknown as AcceptedPlugin[]).process(source, {
    from: cssPath,
  });

  const declarationValueFor = (
    selector: string,
    property: string
  ): string | undefined => {
    let value: string | undefined;
    result.root.walkRules((rule) => {
      const selectors = rule.selector
        .split(',')
        .map((entry) => entry.trim().replaceAll('\\', ''));
      if (!selectors.includes(selector)) return;
      rule.walkDecls(property, (declaration) => {
        value = declaration.value;
      });
    });
    return value;
  };

  assert.equal(declarationValueFor('*', 'box-sizing'), 'border-box');
  assert.equal(declarationValueFor('.flex', 'display'), 'flex');
  assert.ok(declarationValueFor('.bg-background', 'background-color'));
  assert.ok(declarationValueFor('.text-foreground', 'color'));

  for (let index = 1; index <= 5; index += 1) {
    assert.ok(
      declarationValueFor(`.bg-chart-${index}`, 'background-color'),
      `expected category chart ${index} to compile to a background color`
    );
  }

  assert.equal(
    declarationValueFor('.aspect-[2/1]', 'aspect-ratio')?.replaceAll(' ', ''),
    '2/1'
  );
});
