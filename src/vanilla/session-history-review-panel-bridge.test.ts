import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { after } from 'node:test';
import type { JudoSession } from '../lib/types';
import type { HistoryReviewResult } from '../lib/jev-history-review';
import type { SessionHistoryReviewPanelProps } from './session-history-review-panel';

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

const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render } = require('@testing-library/react') as typeof import('@testing-library/react');
const { SessionHistoryReviewPanel } = require('../components/session-history-review-panel') as typeof import('../components/session-history-review-panel');

const session: JudoSession = {
  id: 'review-adapter-session',
  date: '2026-09-20',
  category: 'Technical',
  effort: 3,
  techniques: ['Uchi mata'],
};
const entry: HistoryReviewResult = {
  sessionId: session.id,
  sessionDate: session.date,
  currentCategory: session.category,
  currentEffort: session.effort,
  error: true,
};

after(() => {
  cleanup();
  dom.window.close();
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('review panel adapter forwards callbacks, preserves focus, and destroys its listener', () => {
  const calls: string[] = [];
  const makeProps = (
    onEditSession: SessionHistoryReviewPanelProps['onEditSession']
  ): SessionHistoryReviewPanelProps => ({
    entries: [entry],
    sessions: [session],
    recurringThemeSummary: { consideredSessions: 0, themes: [] },
    onEditSession,
  });
  const element = (props: SessionHistoryReviewPanelProps) => React.createElement(
    React.StrictMode,
    null,
    React.createElement(SessionHistoryReviewPanel, props)
  );
  const view = render(element(makeProps((target) => calls.push(`first:${target.id}`))));
  const button = view.container.querySelector<HTMLButtonElement>(
    '[data-ui-action="history-review-edit"]'
  )!;
  button.focus();

  view.rerender(element(makeProps((target) => calls.push(`latest:${target.id}`))));
  const updatedButton = view.container.querySelector<HTMLButtonElement>(
    '[data-ui-action="history-review-edit"]'
  )!;
  assert.equal(dom.window.document.activeElement, updatedButton);
  fireEvent.click(updatedButton);
  assert.deepEqual(calls, ['latest:review-adapter-session']);

  view.unmount();
  fireEvent.click(updatedButton);
  assert.deepEqual(calls, ['latest:review-adapter-session']);
});
