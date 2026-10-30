import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TrainingAnalyticsDisclosure } from './training-analytics-disclosure';

test('dashboard analytics start collapsed behind a descriptive disclosure', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        TrainingAnalyticsDisclosure,
        null,
        React.createElement('div', null, 'Effort trend')
      )
    )
  );
  const disclosure = document.querySelector('details');

  assert.ok(disclosure);
  assert.equal(disclosure?.hasAttribute('open'), false);
  assert.match(disclosure?.querySelector('summary')?.textContent ?? '', /Explore training trends/);
  assert.match(disclosure?.textContent ?? '', /Effort trend/);
});
