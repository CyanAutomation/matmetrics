import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render, screen } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { Label } = require('./label') as typeof import('./label');
const { Separator } = require('./separator') as typeof import('./separator');
const { Switch } = require('./switch') as typeof import('./switch');

test('native label retains its control association and base styling', () => {
  const label = render(React.createElement(Label, { htmlFor: 'session-date' }, 'Date'));

  assert.equal(label.getByText('Date').tagName.toLowerCase(), 'label');
  assert.equal(label.getByText('Date').getAttribute('for'), 'session-date');
  assert.match(label.getByText('Date').className, /font-medium/);
  cleanup();
});

test('native separator keeps decorative and semantic orientations', () => {
  render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Separator, { id: 'decorative' }),
      React.createElement(Separator, {
        id: 'vertical',
        orientation: 'vertical',
        decorative: false,
      })
    )
  );

  assert.equal(document.getElementById('decorative')?.getAttribute('aria-hidden'), 'true');
  assert.equal(document.getElementById('vertical')?.getAttribute('role'), 'separator');
  assert.equal(
    document.getElementById('vertical')?.getAttribute('aria-orientation'),
    'vertical'
  );
  cleanup();
});

test('native switch is a checkbox with switch semantics and reports changes', () => {
  const checkedValues: boolean[] = [];
  render(
    React.createElement(Switch, {
      defaultChecked: false,
      onCheckedChange: (checked: boolean) => checkedValues.push(checked),
      'aria-label': 'Enable plugin',
    })
  );

  const control = screen.getByRole('switch', { name: 'Enable plugin' });
  assert.ok(control instanceof HTMLInputElement);
  assert.equal(control.type, 'checkbox');
  fireEvent.click(control);
  assert.deepEqual(checkedValues, [true]);
  cleanup();
});
