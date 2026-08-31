import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SegmentedControl } from './segmented-control';

test('SegmentedControl exposes one labelled, single-select control', () => {
  const document = parse(
    renderToStaticMarkup(
      <SegmentedControl aria-label="Training distribution timeframe" value="30">
        <SegmentedControl.Item value="30">30 days</SegmentedControl.Item>
        <SegmentedControl.Item value="90">90 days</SegmentedControl.Item>
      </SegmentedControl>
    )
  );

  const group = document.querySelector('[role="group"]');
  const selected = document.querySelector('[aria-pressed="true"]');
  const unselected = document.querySelector('[aria-pressed="false"]');

  assert.equal(
    group?.getAttribute('aria-label'),
    'Training distribution timeframe'
  );
  assert.equal(selected?.textContent.trim(), '30 days');
  assert.equal(unselected?.textContent.trim(), '90 days');
  assert.match(group?.getAttribute('class') ?? '', /rounded/);
});
