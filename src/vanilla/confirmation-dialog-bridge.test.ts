import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const globalKeys = [
  'window',
  'document',
  'HTMLElement',
  'IS_REACT_ACT_ENVIRONMENT',
  'navigator',
] as const;
const originalGlobals = new Map(
  globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});
Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
});
Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value(this: HTMLDialogElement) { this.removeAttribute('open'); },
});

const React = require('react') as typeof import('react');
const { act, cleanup, fireEvent, render } = require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaConfirmationDialog } = require('../components/vanilla-confirmation-dialog') as typeof import('../components/vanilla-confirmation-dialog');

after(() => {
  cleanup();
  dom.window.close();
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('confirmation dialog adapter forwards new props and cleans up in Strict Mode', async () => {
  const calls: string[] = [];
  const props = {
    open: true,
    title: 'Delete this session?',
    description: 'This permanently removes the session.',
    cancelLabel: 'Keep session',
    confirmLabel: 'Delete session',
    pendingLabel: 'Deleting…',
    pending: false,
    confirmVariant: 'destructive' as const,
    onOpenChange: (open: boolean) => calls.push(`open:${open}`),
    onConfirm: async () => { calls.push('confirm:first'); },
  };
  const element = (nextProps: typeof props) => React.createElement(
    React.StrictMode,
    null,
    React.createElement(VanillaConfirmationDialog, nextProps)
  );
  const view = render(element(props));
  const dialog = view.container.querySelector('dialog')!;
  assert.equal(dialog.open, true);

  await act(async () => {
    fireEvent.click(view.container.querySelector('[data-ui-action="confirmation-submit"]')!);
  });
  assert.deepEqual(calls, ['confirm:first', 'open:false']);

  view.rerender(element({
    ...props,
    open: false,
    title: 'Updated title',
    cancelLabel: 'Cancel update',
    onConfirm: async () => { calls.push('confirm:updated'); },
  }));
  assert.equal(view.container.querySelector('dialog'), dialog);
  assert.equal(dialog.open, false);
  assert.equal(dialog.querySelector('[data-dialog-title]')?.textContent, 'Updated title');
  assert.equal(dialog.querySelector('[data-ui-action="confirmation-cancel"]')?.textContent, 'Cancel update');

  const cancel = view.container.querySelector<HTMLButtonElement>('[data-ui-action="confirmation-cancel"]')!;
  await act(async () => { fireEvent.click(cancel); });
  assert.deepEqual(calls, ['confirm:first', 'open:false']);
  view.unmount();
  await act(async () => { fireEvent.click(cancel); });
  assert.deepEqual(calls, ['confirm:first', 'open:false']);
});
