import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

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

const React = require('react') as typeof import('react');
const { cleanup, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { Dialog, DialogContent, DialogDescription, DialogTitle } =
  require('./dialog') as typeof import('./dialog');

test('dialog close control is layered above sticky content', () => {
  render(
    React.createElement(
      Dialog,
      { open: true },
      React.createElement(
        DialogContent,
        null,
        React.createElement(
          'header',
          { className: 'sticky top-0 z-20' },
          React.createElement(DialogTitle, null, 'Session')
        ),
        React.createElement(DialogDescription, null, 'Session form'),
        React.createElement('div', null, 'Form')
      )
    )
  );
  const close = screen.getByRole('button', { name: 'Close' });
  const stickyContent = document.querySelector('[class*="sticky"]');
  const zIndex = (element: Element | null) => {
    const layer = element?.getAttribute('class')?.match(/\bz-(\d+)\b/);
    return layer ? Number(layer[1]) : Number.NaN;
  };

  // The close control stays above sticky dialog content by design.
  // See docs/blueprint.md#elevation--depth.
  assert.ok(stickyContent);
  assert.ok(
    zIndex(close) > zIndex(stickyContent),
    'the close control should layer above sticky content'
  );
  cleanup();
});
