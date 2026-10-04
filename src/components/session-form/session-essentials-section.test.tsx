import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SessionEssentialsSection } from './session-essentials-section';

test('session essentials keeps the coach illustration out of the tablet-only stacked layout', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(SessionEssentialsSection, {
        date: '2026-09-28',
        duration: '',
        category: 'Technical',
        availableCategories: ['Technical'],
        effort: 3,
        showAvatar: true,
        shouldHideHeader: false,
        fid: (suffix: string) => suffix,
        setDate: () => undefined,
        setDuration: () => undefined,
        setCategory: () => undefined,
        setEffort: () => undefined,
      })
    )
  );
  const illustration = document.querySelector(
    'img[alt*="ready to help log your training session"]'
  );
  const responsiveFrame = illustration?.parentNode?.parentNode?.parentNode;

  assert.ok(illustration);
  assert.match(
    responsiveFrame?.getAttribute('class') ?? '',
    /hidden shrink-0 @min-\[56rem\]\/essentials:flex/
  );
  assert.doesNotMatch(
    responsiveFrame?.getAttribute('class') ?? '',
    /hidden md:flex/
  );
});

test('effort options use a neutral surface until selected', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(SessionEssentialsSection, {
        date: '2026-09-28',
        duration: '',
        category: 'Technical',
        availableCategories: ['Technical'],
        effort: 3,
        showAvatar: false,
        shouldHideHeader: false,
        fid: (suffix: string) => suffix,
        setDate: () => undefined,
        setDuration: () => undefined,
        setCategory: () => undefined,
        setEffort: () => undefined,
      })
    )
  );
  const options = document.querySelectorAll('[aria-label^="Effort level:"]');
  const selected = document.querySelector('[aria-label="Effort level: Normal"]');
  const unselected = document.querySelector('[aria-label="Effort level: Easy"]');

  assert.equal(options.length, 5);
  assert.equal(selected?.getAttribute('aria-pressed'), 'true');
  assert.equal(unselected?.getAttribute('aria-pressed'), 'false');
  assert.match(selected?.getAttribute('class') ?? '', /bg-\[linear-gradient/);
  assert.doesNotMatch(unselected?.getAttribute('class') ?? '', /bg-\[linear-gradient/);
});
