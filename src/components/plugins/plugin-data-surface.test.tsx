import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, mock } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PluginBulkActions } from '@/components/plugins/plugin-bulk-actions';
import {
  PluginDataSurfaceFilterRow,
  PluginDataSurfaceSplit,
  PluginDataSurfaceSummaryStrip,
  PluginEmptyFilteredResults,
} from '@/components/plugins/plugin-data-surface';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');

afterEach(cleanup);

const normalizeMarkup = (html: string): string =>
  html.replace(/\s+/g, ' ').trim();

test('PluginDataSurfaceFilterRow exposes an accessible group and preserves associated filter controls', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginDataSurfaceFilterRow,
        null,
        React.createElement('label', { htmlFor: 'status-filter' }, 'Status'),
        React.createElement(
          'select',
          { id: 'status-filter', name: 'status' },
          React.createElement('option', { value: 'active' }, 'Active')
        )
      )
    )
  );

  assert.match(
    html,
    /<div[^>]*role="group"[^>]*aria-label="Filters"[^>]*data-slot="plugin-filter-row"[^>]*>/
  );
  assert.match(html, /<label for="status-filter">Status<\/label>/);
  assert.match(html, /<select id="status-filter" name="status">/);
  assert.match(html, /<option value="active">Active<\/option>/);
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
  assert.match(html, /1 active filter/);
  assert.match(html, /Status: Needs attention/);
});

test('PluginDataSurfaceSummaryStrip shows no-active-filters helper copy', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginDataSurfaceSummaryStrip, {
        filteredCount: 10,
        totalCount: 10,
        itemLabel: 'sessions',
      })
    )
  );

  assert.match(html, /No active filters/);
});

test('PluginEmptyFilteredResults renders a clear-search CTA', () => {
  const onClear = mock.fn();

  render(
    React.createElement(PluginEmptyFilteredResults, {
      title: 'No filtered rows',
      description: 'Try broadening filters.',
      clearLabel: 'Clear filters',
      onClear,
    })
  );

  assert.ok(screen.getByText('No filtered rows'));
  assert.ok(screen.getByText('Try broadening filters.'));

  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

  assert.equal(onClear.mock.callCount(), 1);
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

test('PluginDataSurfaceSplit avoids two-column layout when detail is omitted', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginDataSurfaceSplit, {
        list: React.createElement('div', null, 'left pane'),
      })
    )
  );

  assert.doesNotMatch(html, /lg:grid-cols-2/);
  assert.match(html, /left pane/);
});

test('PluginBulkActions exposes disabled and enabled selection states', () => {
  const onRunAction = mock.fn();
  const renderBulkActions = (selectedCount: number) =>
    React.createElement(
      PluginBulkActions,
      {
        selectedCount,
        itemLabel: 'file',
        isDisabled: selectedCount === 0,
        disabledMessage:
          selectedCount === 0 ? 'Select at least one file.' : undefined,
      },
      React.createElement(
        'button',
        {
          type: 'button',
          disabled: selectedCount === 0,
          onClick: onRunAction,
        },
        'Run action'
      )
    );

  const { rerender } = render(renderBulkActions(0));
  const selectionAnnouncement = screen.getByText('0 files selected');
  const disabledExplanation = screen.getByText('Select at least one file.');
  const actionRegion = screen.getByRole('group', { name: 'Bulk actions' });
  const action = screen.getByRole('button', { name: 'Run action' });

  assert.equal(selectionAnnouncement.getAttribute('aria-live'), 'polite');
  assert.equal(
    actionRegion.getAttribute('aria-describedby'),
    disabledExplanation.id
  );
  assert.equal(action.hasAttribute('disabled'), true);

  fireEvent.click(action);
  assert.equal(onRunAction.mock.callCount(), 0);

  // PluginBulkActions describes availability; callers own the action control's
  // disabled state and update it when their selection becomes actionable.
  rerender(renderBulkActions(1));

  assert.ok(screen.getByText('1 file selected'));
  const enabledAction = screen.getByRole('button', { name: 'Run action' });
  assert.equal(enabledAction.hasAttribute('disabled'), false);

  fireEvent.click(enabledAction);
  assert.equal(onRunAction.mock.callCount(), 1);
});

test('PluginBulkActions provides default disabled-state messaging when needed', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginBulkActions,
        {
          selectedCount: 0,
          itemLabel: 'file',
          isDisabled: true,
        },
        React.createElement('button', { type: 'button' }, 'Run action')
      )
    )
  );

  assert.match(html, /Bulk actions are unavailable/);
});
