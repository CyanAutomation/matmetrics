import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FilterBar } from '@/components/ui/filter-bar';

test('FilterBar provides a labelled filter region and preserves child controls', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        FilterBar,
        { label: 'Filter training history' },
        React.createElement('input', { 'aria-label': 'Search history' })
      )
    )
  );

  const filterBar = document.querySelector('[role="region"]');
  assert.ok(filterBar);
  assert.equal(filterBar.getAttribute('role'), 'region');
  assert.equal(
    filterBar.getAttribute('aria-label'),
    'Filter training history'
  );
  assert.ok(filterBar.querySelector('input'));
});
