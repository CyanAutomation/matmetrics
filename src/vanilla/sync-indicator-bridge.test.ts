import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = require('react') as typeof import('react');
const { render, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { SyncIndicator } = require('../components/sync-indicator') as typeof import('../components/sync-indicator');

test('dashboard bridge updates the existing indicator through Strict Mode remounts', () => {
  const initial = { isOnline: true, isSyncing: false, pendingCount: 0, statusText: 'Synced' };
  const makeView = (props: typeof initial) => React.createElement(React.StrictMode, null, React.createElement(SyncIndicator, props));
  const view = render(makeView(initial));
  const indicator = view.container.querySelector<HTMLElement>('[data-sync-indicator]')!;
  assert.equal(indicator.hidden, true);
  view.rerender(makeView({ ...initial, isOnline: false }));
  assert.equal(view.container.querySelector('[data-sync-indicator]'), indicator);
  assert.equal(indicator.hidden, false);
  assert.equal(indicator.getAttribute('aria-label'), 'Offline');
  view.rerender(makeView({ ...initial, isSyncing: true, statusText: 'Syncing' }));
  assert.equal(indicator.dataset.state, 'syncing');
  assert.equal(indicator.getAttribute('aria-label'), 'Syncing');
  view.unmount();
  cleanup();
});
