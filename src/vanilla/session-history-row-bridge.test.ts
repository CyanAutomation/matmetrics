import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';
import type { JudoSession } from '../lib/types';
import type { SessionHistoryRowProps } from './session-history-row';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const globalKeys = ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'navigator'] as const;
const originalGlobals = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

const React = require('react') as typeof import('react');
const { render, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { SessionHistoryRow } = require('../components/session-history-row') as typeof import('../components/session-history-row');

const session: JudoSession = {
  id: 'session-bridge',
  date: '2026-09-20',
  category: 'Technical',
  effort: 3,
  techniques: ['Uchi mata', 'Osoto gari'],
};

function element(overrides: Partial<SessionHistoryRowProps> = {}) {
  const props: SessionHistoryRowProps = {
    session,
    onDelete: () => undefined,
    onEdit: () => undefined,
    onFilterTechnique: () => undefined,
    deletingSessionId: null,
    density: 'compact',
    ...overrides,
  };
  return React.createElement(React.StrictMode, null, React.createElement(SessionHistoryRow, props));
}

after(() => {
  cleanup();
  dom.window.close();
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('React adapter forwards updates and cleans up the vanilla controller in Strict Mode', async () => {
  const calls: string[] = [];
  const view = render(element({
    onDelete: (id) => calls.push(`delete:${id}`),
    onEdit: (value) => calls.push(`edit:${value.id}`),
    onFilterTechnique: (value) => calls.push(`filter:${value}`),
  }));
  const row = view.container.querySelector('[data-ui-session-history-row]')!;
  const details = row.querySelector<HTMLDetailsElement>('.ui-session-details')!;
  const technique = row.querySelector<HTMLButtonElement>('.ui-action-chip-list__chip')!;
  details.open = true;
  technique.focus();

  view.rerender(element({
    session: { ...session, category: 'Randori', notes: 'Updated through React props' },
    onDelete: (id) => calls.push(`updated-delete:${id}`),
    onEdit: (value) => calls.push(`updated-edit:${value.id}`),
    onFilterTechnique: (value) => calls.push(`updated-filter:${value}`),
    density: 'comfortable',
  }));

  assert.equal(view.container.querySelector('[data-ui-session-history-row]'), row);
  assert.equal(row.querySelector('.ui-session-details'), details);
  assert.equal(details.open, true);
  assert.equal(dom.window.document.activeElement, technique);
  assert.equal(row.querySelector('[data-session-category]')?.textContent, 'Randori');
  assert.match(row.textContent!, /Updated through React props/);
  assert.equal(row.classList.contains('ui-session-history-row--comfortable'), true);

  technique.click();
  row.querySelector<HTMLButtonElement>('[data-action-value="edit"]')!.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, ['updated-filter:Uchi mata', 'updated-edit:session-bridge']);

  view.unmount();
  technique.click();
  row.querySelector<HTMLButtonElement>('[data-action-value="delete"]')!.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(calls, ['updated-filter:Uchi mata', 'updated-edit:session-bridge']);
});
