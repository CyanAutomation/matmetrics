import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  confirmationDialogHtml,
  mountConfirmationDialog,
  type ConfirmationDialogProps,
} from './confirmation-dialog';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

function createOpenDialog(props: ConfirmationDialogProps) {
  const dom = new JSDOM('<button id="trigger">Open</button><main></main>');
  const document = dom.window.document as Document;
  const host = document.querySelector('main')!;
  host.innerHTML = confirmationDialogHtml(props);
  const dialog = host.querySelector('dialog')!;
  // jsdom does not implement the browser modal dialog API.
  dialog.showModal = () => { dialog.setAttribute('open', ''); };
  dialog.close = () => { dialog.removeAttribute('open'); };
  return { dom, document, host, dialog };
}

function makeProps(overrides: Partial<ConfirmationDialogProps> = {}): ConfirmationDialogProps {
  return {
    id: 'delete-session',
    open: true,
    title: 'Delete this session?',
    description: 'This permanently removes the session.',
    cancelLabel: 'Keep session',
    confirmLabel: 'Delete session',
    pendingLabel: 'Deleting…',
    pending: false,
    confirmVariant: 'destructive',
    onOpenChange: () => {},
    onConfirm: () => {},
    ...overrides,
  };
}

test('confirmation dialog renders escaped, labelled content and reusable action buttons', () => {
  const markup = confirmationDialogHtml(makeProps({
    title: 'Delete <session>?',
    description: 'Keep & review later.',
    cancelLabel: 'Keep <session>',
  }));
  const dom = new JSDOM(markup);
  const dialog = dom.window.document.querySelector('dialog')!;

  assert.equal(dialog.getAttribute('aria-labelledby'), 'delete-session-title');
  assert.equal(dialog.getAttribute('aria-describedby'), 'delete-session-description');
  assert.equal(dialog.querySelector('#delete-session-title')?.textContent, 'Delete <session>?');
  assert.equal(dialog.querySelector('#delete-session-description')?.textContent, 'Keep & review later.');
  assert.equal(dialog.querySelector('[data-ui-action="confirmation-cancel"]')?.textContent, 'Keep <session>');
  assert.equal(dialog.querySelector('[data-ui-action="confirmation-submit"]')?.textContent, 'Delete session');
  assert.equal(dialog.querySelector('[data-ui-action="confirmation-submit"]')?.getAttribute('data-variant'), 'destructive');
  dom.window.close();
});

test('confirmation waits for the action, blocks duplicate submits, and closes after success', async () => {
  let finish!: () => void;
  const events: string[] = [];
  const props = makeProps({
    onOpenChange: (open) => events.push(`open:${open}`),
    onConfirm: () => {
      events.push('confirm');
      return new Promise<void>((resolve) => { finish = resolve; });
    },
  });
  const { dom, document, host, dialog } = createOpenDialog(props);
  const trigger = document.querySelector<HTMLButtonElement>('#trigger')!;
  trigger.focus();
  const controller = mountConfirmationDialog(dialog, props);
  const cancel = host.querySelector<HTMLButtonElement>('[data-ui-action="confirmation-cancel"]')!;
  const confirm = host.querySelector<HTMLButtonElement>('[data-ui-action="confirmation-submit"]')!;
  const close = host.querySelector<HTMLButtonElement>('[data-dialog-close]')!;

  confirm.click();
  confirm.click();
  assert.deepEqual(events, ['confirm']);
  assert.equal(confirm.disabled, true);
  assert.equal(cancel.disabled, true);
  assert.equal(close.disabled, true);
  assert.equal(confirm.getAttribute('aria-busy'), 'true');
  assert.equal(confirm.textContent, 'Deleting…');

  const escape = new dom.window.Event('cancel', { cancelable: true });
  dialog.dispatchEvent(escape);
  cancel.click();
  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(events, ['confirm']);

  finish();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ['confirm', 'open:false']);
  controller.update({ ...props, open: false });
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement, trigger);

  controller.destroy();
  dom.window.close();
});

test('confirmation keeps the dialog open and reports errors when the action fails', async () => {
  const events: string[] = [];
  const props = makeProps({
    onOpenChange: (open) => events.push(`open:${open}`),
    onConfirm: async () => { throw new Error('delete failed'); },
    onConfirmError: (error) => events.push(`error:${(error as Error).message}`),
  });
  const { dom, host, dialog } = createOpenDialog(props);
  const controller = mountConfirmationDialog(dialog, props);
  const confirm = host.querySelector<HTMLButtonElement>('[data-ui-action="confirmation-submit"]')!;

  confirm.click();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(dialog.open, true);
  assert.equal(confirm.disabled, false);
  assert.deepEqual(events, ['error:delete failed']);
  controller.destroy();
  dom.window.close();
});

test('confirmation recovers when its action throws before returning a promise', () => {
  const events: string[] = [];
  const props = makeProps({
    onOpenChange: (open) => events.push(`open:${open}`),
    onConfirm: () => { throw new Error('synchronous failure'); },
    onConfirmError: (error) => events.push(`error:${(error as Error).message}`),
  });
  const { dom, host, dialog } = createOpenDialog(props);
  const controller = mountConfirmationDialog(dialog, props);
  const confirm = host.querySelector<HTMLButtonElement>(
    '[data-ui-action="confirmation-submit"]'
  )!;

  confirm.click();

  assert.equal(dialog.open, true);
  assert.equal(confirm.disabled, false);
  assert.deepEqual(events, ['error:synchronous failure']);
  controller.destroy();
  dom.window.close();
});
