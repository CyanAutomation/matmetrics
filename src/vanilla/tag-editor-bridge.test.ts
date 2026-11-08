import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = require('react') as typeof import('react');
const { render, fireEvent, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaTagEditor } = require('../components/vanilla-tag-editor') as typeof import('../components/vanilla-tag-editor');

test('tag editor adapter updates props and removes event listeners in Strict Mode', () => {
  const events: string[] = [];
  const props = {
    id: 'technique',
    label: 'Technique tags',
    inputLabel: 'Add a technique tag',
    values: ['Uchi mata'],
    newValue: '',
    placeholder: 'Add a technique',
    onInput: (value: string) => events.push('old:' + value),
    onAdd: () => events.push('old-add'),
    onRemove: (value: string) => events.push('old-remove:' + value),
  };
  const view = render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaTagEditor, props)
    )
  );
  const input = view.getByLabelText('Add a technique tag') as HTMLInputElement;
  view.rerender(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaTagEditor, {
        ...props,
        values: ['Uchi mata', 'Seoi nage'],
        newValue: 'tai otoshi',
        onInput: (value: string) => events.push('new:' + value),
        onAdd: () => events.push('new-add'),
        onRemove: (value: string) => events.push('new-remove:' + value),
      })
    )
  );
  assert.equal(input.value, 'tai otoshi');
  fireEvent.input(input, { target: { value: 'Harai goshi' } });
  fireEvent.click(view.getByLabelText('Remove Seoi nage technique tag'));
  assert.deepEqual(events, ['new:Harai goshi', 'new-remove:Seoi nage']);
  view.unmount();
  fireEvent.input(input, { target: { value: 'Grace' } });
  assert.deepEqual(events, ['new:Harai goshi', 'new-remove:Seoi nage']);
  cleanup();
});
