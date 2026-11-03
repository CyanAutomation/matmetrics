import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { dialogHtml, mountDialog } from './dialog';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('dialog escapes its labels and links its accessible name and description', () => {
  const dom = new JSDOM('<main></main>');
  const host = dom.window.document.querySelector('main')!;
  host.innerHTML = dialogHtml({ id: 'history', title: '<History>', description: 'Recent & new' });
  const dialog = host.querySelector('dialog')!;
  assert.equal(dialog.getAttribute('aria-labelledby'), 'history-title');
  assert.equal(dialog.getAttribute('aria-describedby'), 'history-description');
  assert.equal(host.querySelector('#history-title')?.textContent, '<History>');
  assert.equal(host.querySelector('#history-description')?.textContent, 'Recent & new');
  assert.equal(host.querySelector('history'), null);
  assert.equal(host.querySelector('button')?.getAttribute('aria-label'), 'Close');
  dom.window.close();
});

test('dialog requests dismissal, updates callbacks, restores focus, and cleans up', () => {
  const dom = new JSDOM('<button id="trigger">Open</button><main></main>');
  const doc = dom.window.document as Document;
  const trigger = doc.querySelector<HTMLButtonElement>('#trigger')!;
  const host = doc.querySelector('main')!;
  host.innerHTML = dialogHtml({ id: 'history', title: 'History', description: 'Recent' });
  const dialog = host.querySelector('dialog')!;
  // jsdom does not implement the browser modal dialog API.
  dialog.showModal = () => { dialog.setAttribute('open', ''); };
  dialog.close = () => { dialog.removeAttribute('open'); };
  let calls = 0;
  trigger.focus();
  const controller = mountDialog(dialog, { open: true, onOpenChange: () => calls++ });
  assert.equal(dialog.open, true);
  const cancel = new dom.window.Event('cancel', { cancelable: true });
  dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(calls, 1);
  controller.update({ open: true, onOpenChange: () => calls += 10 });
  host.querySelector<HTMLButtonElement>('[data-dialog-close]')!.click();
  assert.equal(calls, 11);
  dialog.getBoundingClientRect = () => ({ left: 20, right: 120, top: 20, bottom: 120 }) as DOMRect;
  dialog.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  assert.equal(calls, 21);
  dialog.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 }));
  assert.equal(calls, 21);
  controller.update({ open: false, onOpenChange: () => calls += 10 });
  assert.equal(dialog.open, false);
  assert.equal(doc.activeElement, trigger);
  controller.destroy();
  host.querySelector<HTMLButtonElement>('[data-dialog-close]')!.click();
  assert.equal(calls, 21);
  dom.window.close();
});
