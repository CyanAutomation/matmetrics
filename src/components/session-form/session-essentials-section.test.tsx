import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SessionEssentialsSection } from './session-essentials-section';

function renderEssentials(showAvatar: boolean) {
  return parse(
    renderToStaticMarkup(
      React.createElement(SessionEssentialsSection, {
        date: '2026-09-28',
        duration: '',
        category: 'Technical',
        availableCategories: ['Technical'],
        effort: 3,
        showAvatar,
        shouldHideHeader: false,
        fid: (suffix: string) => suffix,
        setDate: () => undefined,
        setDuration: () => undefined,
        setCategory: () => undefined,
        setEffort: () => undefined,
      })
    )
  );
}

test('session essentials includes the coach illustration only when avatar mode is enabled', () => {
  const enabled = renderEssentials(true);
  const disabled = renderEssentials(false);

  assert.ok(
    enabled.querySelector(
      'img[alt="Ressa in coach mode, ready to help log your training session"]'
    )
  );
  assert.equal(
    disabled.querySelector(
      'img[alt="Ressa in coach mode, ready to help log your training session"]'
    ),
    null
  );
});

test('effort options expose which level is selected to assistive technology', () => {
  const document = renderEssentials(false);
  const options = document.querySelectorAll('[aria-label^="Effort level:"]');
  const selected = document.querySelector('[aria-label="Effort level: Normal"]');
  const unselected = document.querySelector('[aria-label="Effort level: Easy"]');

  assert.equal(options.length, 5);
  assert.equal(selected?.getAttribute('aria-pressed'), 'true');
  assert.equal(unselected?.getAttribute('aria-pressed'), 'false');
});
