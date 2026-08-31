import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PageShell } from '@/components/ui/page-shell';

test('PageShell keeps every application page on the same semantic hierarchy', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        PageShell,
        {
          title: 'Training history',
          description: 'Review every session in one place.',
          eyebrow: 'Training',
          actions: React.createElement('button', null, 'Add session'),
        },
        React.createElement('div', { 'data-testid': 'content' }, 'Body')
      )
    )
  );

  const section = document.querySelector('section');
  const header = section?.querySelector('header');

  assert.ok(section);
  assert.equal(header?.querySelector('p')?.textContent, 'Training');
  assert.equal(header?.querySelector('h2')?.textContent, 'Training history');
  assert.equal(
    header?.querySelector('h2 + p')?.textContent,
    'Review every session in one place.'
  );
  assert.equal(header?.querySelector('button')?.textContent, 'Add session');
  assert.equal(
    document.querySelector('[data-testid="content"]')?.textContent,
    'Body'
  );
});

test('PageShell avoids empty optional regions', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        PageShell,
        { title: 'Dashboard', description: 'Your next session.' },
        'Content'
      )
    )
  );

  const header = document.querySelector('header');
  assert.equal(header?.querySelectorAll('p').length, 1);
  assert.equal(header?.querySelector('button'), null);
});
