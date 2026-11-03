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
const { VanillaTextField } = require('../components/vanilla-text-field') as typeof import('../components/vanilla-text-field');

test('bridge updates controlled input and callbacks in Strict Mode and cleans up', () => {
  let value = '';
  const props = { id: 'test-field', label: 'Name', value: '', onInput: (next: string) => { value = `old:${next}`; } };
  const view = render(React.createElement(React.StrictMode, null, React.createElement(VanillaTextField, props)));
  const input = view.getByLabelText('Name') as HTMLInputElement;
  view.rerender(React.createElement(React.StrictMode, null, React.createElement(VanillaTextField, { ...props, value: 'A', invalid: true, hint: 'Try again', onInput: (next: string) => { value = `new:${next}`; } })));
  assert.equal(input.value, 'A');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(input.getAttribute('aria-describedby'), 'test-field-hint');
  fireEvent.input(input, { target: { value: 'Ada' } });
  assert.equal(value, 'new:Ada');
  view.unmount();
  fireEvent.input(input, { target: { value: 'Grace' } });
  assert.equal(value, 'new:Ada');
  cleanup();
});
