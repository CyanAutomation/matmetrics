import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PluginAuthGateNotice } from '@/components/plugins/plugin-auth-gate-notice';
import {
  PluginFormSection,
  PluginStatusPanel,
  PluginTableSection,
} from '@/components/plugins/plugin-kit';
import { PluginSectionCard } from '@/components/plugins/plugin-section-card';
import {
  PluginStatCard,
  PluginStatsGrid,
} from '@/components/plugins/plugin-stats-grid';
import { PluginToolbar } from '@/components/plugins/plugin-toolbar';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});
const { cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');

const normalizeMarkup = (html: string): string =>
  html.replace(/\s+/g, ' ').trim();

type ParsedNode = {
  nodeType: number;
  textContent: string;
  childNodes: ParsedNode[];
};

test('PluginAuthGateNotice distinguishes signed-out and unavailable auth states', () => {
  const authUnavailable = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginAuthGateNotice, {
        isAuthenticated: false,
        authAvailable: false,
        authUnavailableDescription: 'Authentication is not configured here.',
      })
    )
  );

  const signedOut = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginAuthGateNotice, {
        isAuthenticated: false,
        authAvailable: true,
        signedOutDescription: 'Sign in to save these settings.',
      })
    )
  );

  const signedIn = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(PluginAuthGateNotice, {
        isAuthenticated: true,
        authAvailable: true,
      })
    )
  );

  assert.match(authUnavailable, /Authentication is not configured here/i);
  assert.match(signedOut, /Sign in to save these settings/i);
  assert.doesNotMatch(signedOut, /not configured/i);
  assert.match(signedIn, /requires an active session/i);
});

test('PluginStatsGrid and PluginStatCard render stat labels and values', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        PluginStatsGrid,
        null,
        React.createElement(PluginStatCard, {
          label: 'Checked links',
          value: 8,
        }),
        React.createElement(PluginStatCard, {
          label: 'Broken links',
          value: 2,
        })
      )
    )
  );
  const grid = document.querySelector('.grid') as ParsedNode | null;
  const cards = grid?.childNodes.filter((node) => node.nodeType === 1);

  assert.ok(grid, 'missing stats grid container');
  assert.equal(cards?.length, 2);
  assert.deepEqual(
    cards?.map((card) =>
      card.childNodes[0]?.childNodes.map((node) => node.textContent)
    ),
    [
      ['Checked links', '8'],
      ['Broken links', '2'],
    ]
  );
});

test('PluginSectionCard renders header and content regions', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        PluginSectionCard,
        {
          title: 'Inventory',
          description: 'Audit rows',
          headerActions: React.createElement('button', null, 'Add row'),
        },
        React.createElement(
          'p',
          { 'data-slot': 'supplied-child' },
          'content block'
        )
      )
    )
  );

  const card = document.querySelector('[data-slot="plugin-section-card"]');
  const header = card?.querySelector(
    '[data-slot="plugin-section-card-header"]'
  );
  const title = header?.querySelector(
    '[data-slot="plugin-section-card-title"]'
  );
  const description = header?.querySelector(
    '[data-slot="plugin-section-card-description"]'
  );
  const headerActions = header?.querySelector(
    '[data-slot="plugin-section-card-header-actions"]'
  );
  const content = card?.querySelector(
    '[data-slot="plugin-section-card-content"]'
  );

  assert.ok(card, 'missing section-card root');
  assert.ok(header, 'missing section-card header');
  assert.equal(title?.tagName, 'H3');
  assert.equal(title?.textContent, 'Inventory');
  assert.equal(description?.textContent, 'Audit rows');
  assert.equal(headerActions?.querySelector('button')?.textContent, 'Add row');
  assert.equal(
    content?.querySelector('[data-slot="supplied-child"]')?.textContent,
    'content block'
  );
});

test('PluginToolbar renders named actions in their semantic regions', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(PluginToolbar, {
        leadingActions: React.createElement('button', null, 'Filter results'),
        trailingActions: React.createElement(
          'button',
          { disabled: true },
          'Save changes'
        ),
      })
    )
  );

  const leading = document.querySelector(
    '[data-slot="plugin-toolbar-leading-actions"]'
  );
  const trailing = document.querySelector(
    '[data-slot="plugin-toolbar-trailing-actions"]'
  );
  const toolbar = document.querySelector('[data-slot="plugin-toolbar"]');

  assert.deepEqual(
    toolbar
      ?.querySelectorAll('button')
      .map((action: ParsedNode) => action.textContent),
    ['Filter results', 'Save changes']
  );
  assert.equal(leading?.getAttribute('role'), 'group');
  assert.equal(leading?.getAttribute('aria-label'), 'Leading toolbar actions');
  assert.equal(leading?.querySelector('button')?.textContent, 'Filter results');
  assert.equal(
    leading?.querySelector('button')?.hasAttribute('disabled'),
    false
  );
  assert.equal(trailing?.getAttribute('role'), 'group');
  assert.equal(
    trailing?.getAttribute('aria-label'),
    'Trailing toolbar actions'
  );
  assert.equal(trailing?.querySelector('button')?.textContent, 'Save changes');
  assert.equal(
    trailing?.querySelector('button')?.hasAttribute('disabled'),
    true
  );
});

test('PluginDestructiveAction shows default confirmation actions and confirms the operation', async (t) => {
  const { PluginDestructiveAction } = await import(
    '@/components/plugins/plugin-destructive-action'
  );
  t.after(cleanup);
  const onConfirm = test.mock.fn();
  render(
    React.createElement(PluginDestructiveAction, {
      open: true,
      onOpenChange: () => {},
      title: 'Delete records',
      description: 'This cannot be undone.',
      onConfirm,
    })
  );

  assert.ok(screen.getByRole('heading', { name: 'Delete records' }));
  assert.ok(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  assert.equal(onConfirm.mock.callCount(), 1);
});

test('PluginDestructiveAction shows pending feedback and prevents confirmation while pending', async (t) => {
  const { PluginDestructiveAction } = await import(
    '@/components/plugins/plugin-destructive-action'
  );
  t.after(cleanup);
  const onConfirm = test.mock.fn();
  render(
    React.createElement(PluginDestructiveAction, {
      open: true,
      onOpenChange: () => {},
      title: 'Delete records',
      description: 'This cannot be undone.',
      onConfirm,
      isPending: true,
    })
  );

  const pendingButton = screen.getByRole('button', { name: 'Working...' });
  assert.equal(pendingButton.hasAttribute('disabled'), true);
  fireEvent.click(pendingButton);
  assert.equal(onConfirm.mock.callCount(), 0);
});

test('PluginFormSection follows the docs/blueprint.md shared form composition', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(
        PluginFormSection,
        {
          title: 'Settings',
          description: 'Shared form shell',
          footerActions: React.createElement('button', null, 'Save'),
        },
        React.createElement('div', { 'data-slot': 'form-fields' }, 'Fields')
      )
    )
  );
  const body = document.querySelector(
    '[data-slot="plugin-section-card-content"]'
  );
  const trailingToolbar = document.querySelector(
    '[data-slot="plugin-toolbar-trailing-actions"][role="group"]' +
      '[aria-label="Trailing toolbar actions"]'
  );
  const saveButton = trailingToolbar?.querySelector('button');
  const fields = body?.querySelector('[data-slot="form-fields"]');

  assert.ok(
    trailingToolbar,
    'docs/blueprint.md shared form composition requires footer actions in the trailing toolbar region'
  );
  assert.equal(saveButton?.textContent, 'Save');
  assert.equal(fields?.textContent, 'Fields');
  assert.equal(
    trailingToolbar.querySelector('[data-slot="form-fields"]'),
    null,
    'docs/blueprint.md shared form composition keeps fields in the form-section body'
  );
});

test('PluginStatusPanel exposes every severity and accessible state text', () => {
  const scenarios = [
    { variant: 'success', role: undefined, title: 'Sync complete' },
    { variant: 'warning', role: 'status', title: 'Sync needs attention' },
    { variant: 'error', role: 'alert', title: 'Sync failed' },
  ] as const;

  for (const scenario of scenarios) {
    const document = parse(
      renderToStaticMarkup(
        React.createElement(PluginStatusPanel, {
          variant: scenario.variant,
          title: scenario.title,
          description: 'Credential status is available.',
          ctaLabel: 'Review sync',
          onCta: () => {},
        })
      )
    );
    const panel = document.querySelector(
      `[data-severity="${scenario.variant}"]`
    );

    assert.ok(panel, `missing ${scenario.variant} severity marker`);
    assert.equal(panel.getAttribute('role'), scenario.role);
    assert.match(panel.textContent, new RegExp(scenario.title));
    assert.match(panel.textContent, /Credential status is available/);
    assert.match(panel.textContent, /Review sync/);
  }
});

test('PluginTableSection renders empty fallback when rows are missing', () => {
  const html = normalizeMarkup(
    renderToStaticMarkup(
      React.createElement(
        PluginTableSection,
        {
          title: 'Rows',
          description: 'Inspect current rows',
          emptyTitle: 'No rows',
          emptyDescription: 'Create one to begin.',
          emptyCtaLabel: 'Add row',
          onEmptyCta: () => {},
          hasRows: false,
        },
        React.createElement('table', null, 'table content')
      )
    )
  );

  assert.match(html, /No rows/);
  assert.match(html, /Add row/);
  assert.doesNotMatch(html, /table content/);
});
