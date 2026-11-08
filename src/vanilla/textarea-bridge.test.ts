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
const { VanillaTextarea } = require('../components/vanilla-textarea') as typeof import('../components/vanilla-textarea');

test('textarea adapter keeps controlled updates and cleans up in Strict Mode', () => {
  let received = '';
  const props = {
    id: 'practice',
    value: '',
    ariaLabel: 'Practice notes',
    onInput: (value: string) => { received = 'old:' + value; },
  };
  const view = render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaTextarea, props)
    )
  );
  const textarea = view.getByLabelText('Practice notes') as HTMLTextAreaElement;
  view.rerender(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaTextarea, {
        ...props,
        value: 'Uchi mata',
        hint: 'Review these notes',
        onInput: (value: string) => { received = 'new:' + value; },
      })
    )
  );
  assert.equal(textarea.value, 'Uchi mata');
  assert.equal(textarea.getAttribute('aria-describedby'), 'practice-hint');
  fireEvent.input(textarea, { target: { value: 'Seoi nage' } });
  assert.equal(received, 'new:Seoi nage');
  view.unmount();
  fireEvent.input(textarea, { target: { value: 'Grace' } });
  assert.equal(received, 'new:Seoi nage');
  cleanup();
});
