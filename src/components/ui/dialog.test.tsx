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

  assert.match(close.getAttribute('class') ?? '', /\bz-30\b/);
  assert.ok(document.querySelector('[class*="sticky"][class*="z-20"]'));
  cleanup();
});
