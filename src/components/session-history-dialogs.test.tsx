import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after, before, mock } from 'node:test';
import type { ComponentProps } from 'react';
import type { JudoSession } from '@/lib/types';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const globalKeys = ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'navigator'] as const;
const originalGlobals = new Map(
  globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
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
let SessionHistoryDialogs: typeof import('./session-history-dialogs').SessionHistoryDialogs;

const session: JudoSession = {
  id: 'session-to-delete',
  date: '2026-10-19',
  category: 'Randori',
  effort: 4,
  techniques: ['Uchi-mata'],
};

before(async () => {
  mock.module('@/components/session-log-form', {
    namedExports: { SessionLogForm: () => React.createElement('div', null, 'Session form') },
  });
  ({ SessionHistoryDialogs } = await import('./session-history-dialogs'));
});

after(() => {
  cleanup();
  dom.window.close();
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function makeProps(overrides: Partial<ComponentProps<typeof SessionHistoryDialogs>> = {}) {
  return {
    editingSession: null,
    sessionPendingDeletion: session,
    deletingSessionId: null,
    onCloseEdit: () => {},
    onEditSaved: () => {},
    onCloseDelete: () => {},
    onDelete: async () => {},
    ...overrides,
  };
}

test('history delete confirmation uses the shared vanilla dialog and preserves pending behavior', async () => {
  const events: string[] = [];
  let finish!: () => void;
  const props = makeProps({
    onCloseDelete: () => events.push('close'),
    onDelete: async (target) => {
      events.push(`delete:${target.id}`);
      await new Promise<void>((resolve) => { finish = resolve; });
    },
  });
  const view = render(React.createElement(SessionHistoryDialogs, props));
  const [editDialog, dialog] = view.container.querySelectorAll('dialog');
  const confirm = view.container.querySelector<HTMLButtonElement>(
    '[data-ui-action="confirmation-submit"]'
  )!;
  const cancel = view.container.querySelector<HTMLButtonElement>(
    '[data-ui-action="confirmation-cancel"]'
  )!;

  assert.equal(editDialog.classList.contains('ui-dialog--wide'), true);
  assert.equal(dialog.open, true);
  assert.match(dialog.textContent ?? '', /October 19, 2026 training session/);
  assert.equal(cancel.textContent, 'Keep session');
  assert.equal(confirm.textContent, 'Delete session');

  await act(async () => { fireEvent.click(confirm); });
  assert.deepEqual(events, ['delete:session-to-delete']);
  assert.equal(confirm.disabled, true);
  assert.equal(cancel.disabled, true);
  assert.equal(confirm.textContent, 'Deleting…');

  await act(async () => { finish(); });
  assert.deepEqual(events, ['delete:session-to-delete', 'close']);
  view.unmount();
});
