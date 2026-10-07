import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  DataList,
  DataListRow,
  DataToolbar,
  DataToolbarSummary,
} from '@/components/ui/data-toolbar';

test('data toolbar provides a labelled filter region and a consistent result summary', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        DataToolbar,
        { label: 'Filter techniques' },
        React.createElement('input', { 'aria-label': 'Search techniques' }),
        React.createElement(DataToolbarSummary, {
          filteredCount: 2,
          totalCount: 5,
          itemLabel: 'techniques',
          activeFilters: [{ label: 'Search', value: 'uchi' }],
        })
      )
    )
  );

  const toolbar = document.querySelector('[role="region"]');
  assert.equal(toolbar?.getAttribute('aria-label'), 'Filter techniques');
  assert.match(document.textContent, /Showing 2 of 5 techniques/);
  assert.match(document.textContent, /Search: uchi/);
});

test('data toolbar supports a single-column layout without inherited responsive columns', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        DataToolbar,
        { label: 'Filter technique tags', layout: 'single' },
        React.createElement('input', { 'aria-label': 'Search tags' })
      )
    )
  );
  const toolbar = document.querySelector('[role="region"]');
  const classes = toolbar?.getAttribute('class') ?? '';

  // This mode intentionally remains one column at every responsive breakpoint.
  // See docs/blueprint.md#component-layout-contracts.
  assert.match(classes, /grid-cols-1/);
  assert.doesNotMatch(classes, /sm:grid-cols-2|lg:grid-cols-5/);
});

test('data list gives rows a shared, accessible containment pattern', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        DataList,
        { 'aria-label': 'Technique results' },
        React.createElement(DataListRow, { role: 'listitem' }, 'Uchi-mata')
      )
    )
  );

  assert.equal(
    document
      .querySelector('[data-slot="data-list"]')
      ?.getAttribute('aria-label'),
    'Technique results'
  );
  assert.equal(
    document.querySelector('[data-slot="data-list-row"]')?.textContent,
    'Uchi-mata'
  );
});
