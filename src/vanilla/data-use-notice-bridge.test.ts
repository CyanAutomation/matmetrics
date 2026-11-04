import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const globalKeys = [
  'window',
  'document',
  'HTMLElement',
  'IS_REACT_ACT_ENVIRONMENT',
  'navigator',
] as const;
const originalGlobals = new Map(
  globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { render, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { DataUseNotice } = require('../components/ui/data-use-notice') as typeof import('../components/ui/data-use-notice');

after(() => {
  cleanup();
  dom.window.close();
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('data-use notice bridge updates the reusable vanilla notice in Strict Mode', () => {
  const view = render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(DataUseNotice, { variant: 'history' })
    )
  );
  const notice = view.container.querySelector<HTMLElement>(
    '[data-slot="data-use-notice"]'
  )!;

  view.rerender(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(DataUseNotice, {
        variant: 'semantic-history-search',
        className: 'wide',
      })
    )
  );

  assert.equal(view.container.querySelector('[data-slot="data-use-notice"]'), notice);
  assert.equal(notice.classList.contains('wide'), true);
  assert.match(notice.textContent ?? '', /query and selected details for up to eight sessions/i);
});
