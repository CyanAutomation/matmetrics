import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PluginBulkActions } from '@/components/plugins/plugin-bulk-actions';
import {
  PluginDataSurfaceFilterRow,
  PluginDataSurfaceSplit,
  PluginDataSurfaceSummaryStrip,
  PluginEmptyFilteredResults,
} from '@/components/plugins/plugin-data-surface';

const normalizeMarkup = (html: string): string =>
  html.replace(/\s+/g, ' ').trim();

test('PluginDataSurfaceFilterRow preserves shared filter grid classes', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginDataSurfaceFilterRow,
        null,
        React.createElement('div', null, 'filter field')
      )
    )
  );

  assert.match(html, /lg:grid-cols-5/);
  assert.match(html, /filter field/);
});

test('PluginDataSurfaceSummaryStrip shows counts and active filter chips', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginDataSurfaceSummaryStrip, {
        filteredCount: 3,
        totalCount: 10,
        itemLabel: 'sessions',
        activeFilters: [{ label: 'Status', value: 'Needs attention' }],
      })
    )
  );

  assert.match(html, /Showing 3 of 10 sessions/);
  assert.match(html, /Active filters/);
  assert.match(html, /Status: Needs attention/);
});

test('PluginEmptyFilteredResults renders a clear-search CTA', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginEmptyFilteredResults, {
        title: 'No filtered rows',
        description: 'Try broadening filters.',
        clearLabel: 'Clear filters',
        onClear: () => {},
      })
    )
  );

  assert.match(html, /No filtered rows/);
  assert.match(html, /Clear filters/);
  assert.match(html, /border-dashed/);
});

test('PluginDataSurfaceSplit renders list and detail columns', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginDataSurfaceSplit, {
        list: React.createElement('div', null, 'left pane'),
        detail: React.createElement('div', null, 'right pane'),
      })
    )
  );

  assert.match(html, /lg:grid-cols-2/);
  assert.match(html, /left pane/);
  assert.match(html, /right pane/);
});

test('PluginBulkActions renders selection count and disabled messaging', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginBulkActions,
        {
          selectedCount: 0,
          itemLabel: 'file',
          disabledMessage: 'Select at least one file.',
        },
        React.createElement('button', { type: 'button' }, 'Run action')
      )
    )
  );

  assert.match(html, /0 files selected/);
  assert.match(html, /Select at least one file/);
  assert.match(html, /Run action/);
});
