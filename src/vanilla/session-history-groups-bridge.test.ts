import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';
import type { JudoSession } from '../lib/types';
import type { SessionHistoryGroupsProps } from './session-history-groups';

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

const React = require('react') as typeof import('react');
const { render, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaSessionHistoryGroups } = require('../components/vanilla-session-history-groups') as typeof import('../components/vanilla-session-history-groups');

const session: JudoSession = {
  id: 'session-bridge',
  date: '2026-09-20',
  category: 'Technical',
  effort: 3,
  techniques: ['Uchi mata', 'Osoto gari'],
};

function makeProps(
  overrides: Partial<SessionHistoryGroupsProps> = {}
): SessionHistoryGroupsProps {
  const grouped = [{ monthLabel: 'September 2026', sessions: [session] }];
  return {
    grouped,
    filteredSessions: grouped.flatMap(({ sessions }) => sessions),
    deletingSessionId: null,
    density: 'compact',
    semanticSearchActive: false,
    onRequestDelete: () => {},
    onEditSession: () => {},
    onFilterTechnique: () => {},
    ...overrides,
  };
}

function element(props: SessionHistoryGroupsProps) {
  return React.createElement(
    React.StrictMode,
    null,
    React.createElement(VanillaSessionHistoryGroups, props)
  );
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

test('React adapter forwards updates and tears down vanilla rows in Strict Mode', () => {
  const calls: string[] = [];
  const view = render(element(makeProps()));
  const row = view.container.querySelector('[data-ui-session-history-row]')!;
  const details = row.querySelector('.ui-session-details') as HTMLDetailsElement;
  const chip = row.querySelector(
    '.ui-action-chip-list__chip'
  ) as HTMLButtonElement;
  details.open = true;
  chip.focus();

  const updatedSession = { ...session, notes: 'Updated through React props' };
  view.rerender(
    element(
      makeProps({
        grouped: [{ monthLabel: 'October 2026', sessions: [updatedSession] }],
        filteredSessions: [updatedSession],
        density: 'comfortable',
        onFilterTechnique: (technique) => calls.push(`updated:${technique}`),
      })
    )
  );

  assert.equal(
    view.container.querySelector('[data-ui-session-history-row]'),
    row
  );
  assert.equal(row.querySelector('.ui-session-details'), details);
  assert.equal(details.open, true);
  assert.equal(document.activeElement, chip);
  assert.match(row.textContent ?? '', /Updated through React props/);
  assert.equal(
    row.classList.contains('ui-session-history-row--comfortable'),
    true
  );

  chip.click();
  assert.deepEqual(calls, ['updated:Uchi mata']);
  view.unmount();
  chip.click();
  assert.deepEqual(calls, ['updated:Uchi mata']);
});
