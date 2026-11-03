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
const { VanillaSegmentedControl } = require('../components/vanilla-segmented-control') as typeof import('../components/vanilla-segmented-control');

test('bridge updates callbacks and selection, preserves focus and cleans up in Strict Mode', () => {
  const calls: string[] = [];
  const props = { label: 'Density', value: 'compact', options: [{ value: 'compact', label: 'Compact' }, { value: 'full', label: 'Full' }], onChange: (value: string) => calls.push(`old:${value}`) };
  const view = render(React.createElement(React.StrictMode, null, React.createElement(VanillaSegmentedControl, props)));
  const button = view.getByRole('button', { name: 'Full' });
  button.focus();
  fireEvent.click(button);
  view.rerender(React.createElement(React.StrictMode, null, React.createElement(VanillaSegmentedControl, { ...props, value: 'full', onChange: (value: string) => calls.push(`new:${value}`) })));
  assert.equal(document.activeElement, button);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  fireEvent.click(button);
  view.unmount();
  fireEvent.click(button);
  assert.deepEqual(calls, ['old:full', 'new:full']);
  cleanup();
});

test('keyed remount uses current props and detaches the old control', () => {
  const calls: string[] = [];
  const options = [{ value: 'compact', label: 'Compact' }, { value: 'full', label: 'Full' }];
  const view = render(React.createElement(VanillaSegmentedControl, {
    key: 'first', label: 'Density', value: 'compact', options,
    onChange: (value: string) => calls.push(`old:${value}`),
  }));
  const oldButton = view.getByRole('button', { name: 'Full' });
  view.rerender(React.createElement(VanillaSegmentedControl, {
    key: 'second', label: 'Display density', value: 'full', options,
    onChange: (value: string) => calls.push(`new:${value}`),
  }));
  assert.ok(view.getByRole('group', { name: 'Display density' }));
  const newButton = view.getByRole('button', { name: 'Full' });
  assert.notEqual(oldButton, newButton);
  assert.equal(newButton.getAttribute('aria-pressed'), 'true');
  fireEvent.click(oldButton);
  fireEvent.click(newButton);
  assert.deepEqual(calls, ['new:full']);
  view.unmount();
  cleanup();
});
