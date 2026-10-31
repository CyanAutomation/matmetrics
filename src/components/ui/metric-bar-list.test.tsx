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
  const widths = [bars[0], bars[1]].map((bar) => {
    const value = bar.getAttribute('style')?.match(/width:\s*([\d.]+)%/);
    return Number(value?.[1]);
  });
  assert.equal(widths[0], 100, 'the largest metric fills its track');
  assert.ok(
    Math.abs((widths[1] ?? 0) - (200 / 3)) < 0.001,
    'each other metric occupies its share of the largest value'
  );
});
