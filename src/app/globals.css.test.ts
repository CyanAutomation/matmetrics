import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import test from 'node:test';

test('[req:docs/blueprint.md#dashboard-session-category-chart-palette] Tailwind compiles base styles, semantic utilities, and all category chart colors', async () => {
  const cssPath = path.join(process.cwd(), 'src/app/globals.css');
  const source = await readFile(cssPath, 'utf8');
  const result = await postcss([tailwindcss()]).process(source, {
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
