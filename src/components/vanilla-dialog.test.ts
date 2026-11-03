import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, afterEach } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
const globalNames = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'IS_REACT_ACT_ENVIRONMENT'] as const;
const originalGlobals = new Map(globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

// jsdom does not implement native modal dialog methods.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render } = require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaDialog } = require('./vanilla-dialog') as typeof import('./vanilla-dialog');

afterEach(() => cleanup());
after(() => {
  dom.window.close();
  for (const name of globalNames) {
    const descriptor = originalGlobals.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('Strict Mode bridge tracks open state and the latest callback across updates', () => {
  const calls: string[] = [];
  const renderDialog = (open: boolean, callback: (open: boolean) => void) =>
    // The component requires children in its props type for createElement.
    // eslint-disable-next-line react/no-children-prop
    React.createElement(React.StrictMode, null, React.createElement(VanillaDialog, {
      open, onOpenChange: callback, title: 'History', description: 'Recent releases',
      children: React.createElement('p', null, 'Dialog content'),
    }));
  const first = (open: boolean) => calls.push(`first:${open}`);
  const latest = (open: boolean) => calls.push(`latest:${open}`);
  const view = render(renderDialog(false, first));
  const dialog = view.container.querySelector('dialog')!;
  assert.equal(dialog.open, false);

  view.rerender(renderDialog(true, first));
  assert.equal(dialog.open, true);
  assert.ok(view.getByText('Dialog content'));
  fireEvent.click(view.getByRole('button', { name: 'Close' }));
  view.rerender(renderDialog(true, latest));
  fireEvent(dialog, new dom.window.Event('cancel', { cancelable: true }));
  assert.deepEqual(calls, ['first:false', 'latest:false']);

  view.rerender(renderDialog(false, latest));
  assert.equal(dialog.open, false);
  view.rerender(renderDialog(true, latest));
  assert.equal(dialog.open, true);
  const closeButton = dialog.querySelector<HTMLButtonElement>('[data-dialog-close]')!;
  view.unmount();
  assert.equal(dialog.open, false);
  fireEvent.click(closeButton);
  assert.deepEqual(calls, ['first:false', 'latest:false']);
});

test('bridge updates its accessible title and description as plain text', () => {
  const props = { open: true, onOpenChange: () => undefined, title: 'Old title', description: 'Old description', children: React.createElement('p', null, 'Kept content') };
  const view = render(React.createElement(VanillaDialog, props));
  const dialog = view.getByRole('dialog', { name: 'Old title' });
  view.rerender(React.createElement(VanillaDialog, {
    ...props, title: '<New title>', description: 'New & updated description',
  }));
  assert.equal(view.getByRole('dialog', { name: '<New title>' }), dialog);
  const title = dialog.querySelector('[data-dialog-title]')!;
  const description = dialog.querySelector('[data-dialog-description]')!;
  assert.equal(title.textContent, '<New title>');
  assert.equal(title.children.length, 0);
  assert.equal(description.textContent, 'New & updated description');
  assert.equal(dialog.getAttribute('aria-labelledby'), title.id);
  assert.equal(dialog.getAttribute('aria-describedby'), description.id);
  assert.ok(view.getByText('Kept content'));
});
