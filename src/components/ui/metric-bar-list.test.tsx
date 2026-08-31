import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MetricBarList } from './metric-bar-list';

test('MetricBarList renders every metric with a value and proportional bar', () => {
  const document = parse(
    renderToStaticMarkup(
      <MetricBarList
        ariaLabel="Top techniques"
        items={[
          {
            label: 'O-soto-gari',
            value: 3,
            valueLabel: '3x',
            barClassName: 'bg-blue-500',
          },
          {
            label: 'Ko-soto-gari',
            value: 2,
            valueLabel: '2x',
            barClassName: 'bg-violet-500',
          },
        ]}
      />
    )
  );

  assert.match(document.textContent, /O-soto-gari/);
  assert.match(document.textContent, /Ko-soto-gari/);
  assert.match(document.textContent, /3x/);
  assert.match(document.textContent, /2x/);

  const bars = document.querySelectorAll('[data-slot="metric-bar"]');
  assert.equal(bars.length, 2);
  assert.match(bars[0]?.getAttribute('style') ?? '', /width:100%/);
  assert.match(bars[1]?.getAttribute('style') ?? '', /width:66\.6667%/);
});
