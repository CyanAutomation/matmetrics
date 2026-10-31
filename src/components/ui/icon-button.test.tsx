import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import { X } from 'lucide-react';

import { IconButton } from './icon-button';

test('IconButton renders an accessible name and uses button semantics', () => {
  const document = parse(
    renderToStaticMarkup(
      <IconButton icon={<X aria-hidden="true" />} label="Remove Uchi mata" />
    )
  );
  const button = document.querySelector('button');

  assert.equal(button?.getAttribute('aria-label'), 'Remove Uchi mata');
  assert.equal(button?.getAttribute('type'), 'button');
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
  const defaultDocument = parse(
    renderToStaticMarkup(
      <IconButton icon={<X aria-hidden="true" />} label="Remove Uchi mata" />
    )
  );
  const defaultButton = defaultDocument.querySelector('button');

  assert.equal(button?.getAttribute('aria-label'), 'Remove Uchi mata');
  assert.equal(button?.getAttribute('type'), 'button');
  assert.notEqual(
    button?.getAttribute('class'),
    defaultButton?.getAttribute('class'),
    'compact actions must use a distinct size treatment from default actions'
  );
});
