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
const { VanillaSelectField } = require('../components/vanilla-select-field') as typeof import('../components/vanilla-select-field');

test('bridge updates options and callback in Strict Mode and cleans up', () => {
  let value = '';
  const props = { id: 'category', label: 'Session type', value: 'a', options: [{ value: 'a', label: 'A' }], onChange: (next: string) => { value = `old:${next}`; } };
  const view = render(React.createElement(React.StrictMode, null, React.createElement(VanillaSelectField, props)));
  const select = view.getByLabelText('Session type') as HTMLSelectElement;
  view.rerender(React.createElement(React.StrictMode, null, React.createElement(VanillaSelectField, { ...props, value: 'b', options: [...props.options, { value: 'b', label: 'B' }], onChange: (next: string) => { value = `new:${next}`; } })));
  assert.equal(select.value, 'b');
  fireEvent.change(select, { target: { value: 'a' } });
  assert.equal(value, 'new:a');
  view.unmount();
  fireEvent.change(select, { target: { value: 'b' } });
  assert.equal(value, 'new:a');
  cleanup();
});
