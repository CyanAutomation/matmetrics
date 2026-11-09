import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { EmptyStateProps } from './empty-state';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
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
const { cleanup, fireEvent, render } =
  require('@testing-library/react') as typeof import('@testing-library/react');
const { VanillaEmptyState } = require('../components/vanilla-empty-state') as typeof import('../components/vanilla-empty-state');

function makeProps(onActivate: () => void): EmptyStateProps {
  return {
    title: 'No sessions yet',
    description: 'Your training will appear here.',
    action: { label: 'Log your first session', onActivate },
  };
}

test('empty state adapter forwards updated callbacks and removes listeners on unmount', () => {
  let firstCalls = 0;
  let nextCalls = 0;
  const view = render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaEmptyState, {
        ...makeProps(() => firstCalls++),
      })
    )
  );
  const host = view.container.firstElementChild as HTMLElement;

  fireEvent.click(view.getByRole('button', { name: 'Log your first session' }));
  assert.equal(firstCalls, 1);
  view.rerender(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VanillaEmptyState, {
        ...makeProps(() => nextCalls++),
        title: 'Welcome back',
      })
    )
  );

  assert.equal(view.getByRole('heading', { name: 'Welcome back' }) !== null, true);
  fireEvent.click(view.getByRole('button', { name: 'Log your first session' }));
  assert.equal(firstCalls, 1);
  assert.equal(nextCalls, 1);
  view.unmount();
  const detachedAction = dom.window.document.createElement('button');
  detachedAction.dataset.uiAction = 'empty-state-action';
  host.append(detachedAction);
  detachedAction.click();
  assert.equal(nextCalls, 1);
  cleanup();
});
