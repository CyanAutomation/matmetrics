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
const { VanillaRadioGroup } = require('../components/vanilla-radio-group') as typeof import('../components/vanilla-radio-group');

test('radio group adapter reflects controlled selection and cleans up in Strict Mode', () => {
  let received = '';
  const props = {
    id: 'effort',
    label: 'Effort level',
    value: '1',
    options: [
      { value: '1', label: 'Easy' },
      { value: '3', label: 'Normal' },
    ],
    onChange: (value: string) => { received = 'old:' + value; },
  };
  const view = render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaRadioGroup, props)
    )
  );
  const easy = view.getByLabelText('Easy') as HTMLInputElement;
  const normal = view.getByLabelText('Normal') as HTMLInputElement;
  view.rerender(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaRadioGroup, {
        ...props,
        value: '3',
        summary: 'Normal',
        onChange: (value: string) => { received = 'new:' + value; },
      })
    )
  );
  assert.equal(normal.checked, true);
  fireEvent.change(easy, { target: { checked: true } });
  assert.equal(received, 'new:1');
  view.unmount();
  fireEvent.change(normal, { target: { checked: true } });
  assert.equal(received, 'new:1');
  cleanup();
});
