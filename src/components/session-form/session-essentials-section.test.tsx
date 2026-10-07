import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SessionEssentialsSection } from './session-essentials-section';

test('session essentials shows the coach illustration only when the container can fit it', () => {
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
  // The illustration waits for its container to reach the documented 56rem width.
  // See docs/blueprint.md#component-layout-contracts.
  assert.match(
    responsiveFrame?.getAttribute('class') ?? '',
    /hidden shrink-0 @min-\[56rem\]\/essentials:flex/
  );
});

test('effort options expose which level is selected to assistive technology', () => {
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
});
