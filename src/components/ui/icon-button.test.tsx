import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import { X } from 'lucide-react';

import { IconButton } from './icon-button';

test('IconButton requires and renders an accessible name with standard control styling', () => {
  const document = parse(
    renderToStaticMarkup(
      <IconButton icon={<X aria-hidden="true" />} label="Remove Uchi mata" />
    )
  );
  const button = document.querySelector('button');

  assert.equal(button?.getAttribute('aria-label'), 'Remove Uchi mata');
  assert.equal(button?.getAttribute('type'), 'button');
  assert.match(button?.getAttribute('class') ?? '', /h-10/);
  assert.match(button?.getAttribute('class') ?? '', /w-10/);
});

test('IconButton supports compact icon actions without dropping its accessible name', () => {
  const document = parse(
    renderToStaticMarkup(
      <IconButton
        icon={<X aria-hidden="true" />}
        label="Remove Uchi mata"
        size="compact"
      />
    )
  );
  const button = document.querySelector('button');

  assert.equal(button?.getAttribute('aria-label'), 'Remove Uchi mata');
  assert.match(button?.getAttribute('class') ?? '', /h-8/);
  assert.match(button?.getAttribute('class') ?? '', /w-8/);
});
