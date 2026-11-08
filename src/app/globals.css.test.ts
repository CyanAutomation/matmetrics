import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import postcssrc from 'postcss-load-config';
import test from 'node:test';

test('[req:docs/blueprint.md#dashboard-session-category-chart-palette] Tailwind compiles base styles, semantic utilities, and all category chart colors', async () => {
  const cssPath = path.join(process.cwd(), 'src/app/globals.css');
  const source = await readFile(cssPath, 'utf8');
  const config = await postcssrc({}, process.cwd());
  const result = await postcss(config.plugins).process(source, {
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
  assert.equal(declarationValueFor('.ui-action-button', 'cursor'), 'pointer');
  assert.equal(
    declarationValueFor('.ui-badge--technical', 'background-color'),
    'hsl(var(--color-category-technical-container))'
  );
  assert.equal(
    declarationValueFor('.ui-session-history-row', 'container'),
    'ui-session-row / inline-size'
  );
  assert.equal(
    declarationValueFor('.ui-session-history-row--compact .ui-session-history-row__note-preview', '-webkit-line-clamp'),
    '1'
  );
  assert.equal(declarationValueFor('.ui-surface', 'border-radius'), '1rem');
  assert.equal(
    declarationValueFor('.ui-surface--default', 'background-color'),
    'hsl(var(--card))'
  );
  assert.equal(
    declarationValueFor('.ui-surface--subtle', 'background-color'),
    'hsl(var(--color-surface-container-low))'
  );
  assert.equal(
    declarationValueFor('.ui-surface--padding-sm', 'padding'),
    '1rem'
  );
  assert.equal(
    declarationValueFor('.ui-session-history-groups__group:last-child', 'margin-block-end'),
    '0'
  );
  assert.equal(
    declarationValueFor('.ui-session-history-groups__heading', 'font-size'),
    '1.125rem'
  );
  assert.equal(
    declarationValueFor('.ui-session-history-review__entry', 'border-radius'),
    '.5rem'
  );
  assert.equal(
    declarationValueFor('.ui-session-history-review__theme-count', 'font-variant-numeric'),
    'tabular-nums'
  );
  assert.ok(declarationValueFor('.ui-session-details__summary:focus-visible', 'outline'));
  assert.equal(declarationValueFor('.ui-dialog[open]', 'display'), 'flex');
  assert.ok(declarationValueFor('.ui-dialog::backdrop', 'background'));
  assert.equal(declarationValueFor('.ui-dialog--wide', 'max-height'), '90vh');
  assert.equal(declarationValueFor('.ui-confirmation-dialog__actions', 'justify-content'), 'flex-end');
  assert.ok(declarationValueFor('.ui-status-message', 'color'));
  assert.equal(declarationValueFor(".ui-textarea__input[data-size='large']", 'min-height'), '7rem');
  assert.ok(declarationValueFor('.ui-textarea__input:focus-visible', 'outline'));
  assert.equal(declarationValueFor(".ui-radio-group[data-layout='responsive'] .ui-radio-group__options", 'grid-template-columns'), 'repeat(5, minmax(0, 1fr))');
  assert.ok(declarationValueFor('.ui-radio-group__input:focus-visible + .ui-radio-group__label', 'outline'));
  assert.equal(declarationValueFor('.ui-tag-editor__list', 'list-style'), 'none');
  assert.ok(declarationValueFor('.ui-tag-editor__remove:focus-visible', 'outline'));
  assert.ok(declarationValueFor("[data-contrast='high'] .ui-tag-editor__list", 'outline'));
  assert.equal(declarationValueFor('.ui-segmented-control', 'display'), 'inline-flex');
  assert.ok(declarationValueFor(".ui-segmented-control__item[aria-pressed='true']", 'background'));
  assert.equal(declarationValueFor('.version-history', 'overflow-y'), 'auto');
  assert.equal(
    declarationValueFor("body[data-snackbar-visible='true'] main", 'margin-bottom'),
    'calc(7rem + env(safe-area-inset-bottom))'
  );

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
