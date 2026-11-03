import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = require('react') as typeof import('react');
const { render, fireEvent, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaActionChipList } = require('../components/vanilla-action-chip-list') as typeof import('../components/vanilla-action-chip-list');

test('adapter updates callbacks and removes listeners in Strict Mode', () => {
  const calls: string[] = [];
  const props = { items: ['Uchi mata'], limit: 3, title: (item: string) => `Show ${item}`, onSelect: (item: string) => calls.push(`old:${item}`) };
  const view = render(React.createElement(React.StrictMode, null, React.createElement(VanillaActionChipList, props)));
  const button = view.getByRole('button', { name: 'Uchi mata' });
  button.focus();
  fireEvent.click(button);
  view.rerender(React.createElement(React.StrictMode, null, React.createElement(VanillaActionChipList, { ...props, onSelect: (item: string) => calls.push(`new:${item}`) })));
  assert.equal(document.activeElement, button);
  fireEvent.click(button);
  view.unmount();
  fireEvent.click(button);
  assert.deepEqual(calls, ['old:Uchi mata', 'new:Uchi mata']);
  cleanup();
});
