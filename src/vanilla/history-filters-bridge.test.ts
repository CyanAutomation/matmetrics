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
const { VanillaHistoryFilters } = require('../components/vanilla-history-filters') as typeof import('../components/vanilla-history-filters');

test('history filters adapter updates callbacks, retains focus and cleans up in Strict Mode', () => {
  const calls: string[] = [];
  const props = {
    category: 'all', effort: 'all', fromDate: '', toDate: '', open: true,
    onCategoryChange: (value: string) => calls.push(`old:${value}`),
    onEffortChange: () => {}, onFromDateChange: () => {}, onToDateChange: () => {}, onClear: () => {},
  };
  const view = render(React.createElement(React.StrictMode, null, React.createElement(VanillaHistoryFilters, props)));
  const select = view.getByLabelText('Filter by session type') as HTMLSelectElement;
  select.focus();
  fireEvent.change(select, { target: { value: 'Randori' } });
  view.rerender(React.createElement(React.StrictMode, null, React.createElement(VanillaHistoryFilters, {
    ...props, category: 'Randori', onCategoryChange: (value: string) => calls.push(`new:${value}`),
  })));
  assert.equal(document.activeElement, select);
  assert.equal(select.value, 'Randori');
  fireEvent.change(select, { target: { value: 'Technical' } });
  view.unmount();
  fireEvent.change(select, { target: { value: 'Randori' } });
  assert.deepEqual(calls, ['old:Randori', 'new:Technical']);
  cleanup();
});
