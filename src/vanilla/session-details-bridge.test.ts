import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const globalKeys = ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'navigator'] as const;
const originalGlobals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = require('react') as typeof import('react');
const { render, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaSessionDetails } = require('../components/vanilla-session-details') as typeof import('../components/vanilla-session-details');

after(() => {
  cleanup();
  dom.window.close();
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('adapter preserves current content and disclosure state across Strict Mode rerenders', () => {
  const element = (description: string) => React.createElement(React.StrictMode, null,
    React.createElement(VanillaSessionDetails, { description }));
  const view = render(element('First'));
  const details = view.container.querySelector('details')!;
  details.open = true;
  view.rerender(element('Second'));
  assert.equal(view.container.querySelector('details'), details);
  assert.equal(details.open, true);
  assert.match(details.textContent!, /Second/);
  assert.doesNotMatch(details.textContent!, /First/);
  view.rerender(element('Second'));
  assert.equal(details.open, true);
  assert.match(details.textContent!, /Second/);
  details.open = false;
  view.rerender(element('Second'));
  assert.equal(details.open, false);
  view.rerender(element(''));
  assert.equal(details.hidden, true);
  view.rerender(element('Restored'));
  assert.equal(details.hidden, false);
  assert.equal(details.open, false);
  assert.match(details.textContent!, /Restored/);
  view.unmount();
});
