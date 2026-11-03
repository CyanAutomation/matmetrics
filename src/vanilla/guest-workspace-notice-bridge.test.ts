import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = require('react') as typeof import('react');
const { render, fireEvent, cleanup } = require('@testing-library/react') as typeof import('@testing-library/react');
const { GuestWorkspaceNotice } = require('../components/guest-workspace-notice') as typeof import('../components/guest-workspace-notice');

test('React bridge updates the vanilla notice and cleans up in Strict Mode', () => {
  let originalCalls = 0;
  let nextCalls = 0;
  const props = { workspaceLabel: 'Demo', message: 'First message', signInButtonText: 'Sign in', onSignIn: () => originalCalls++ };
  const view = render(React.createElement(React.StrictMode, null, React.createElement(GuestWorkspaceNotice, props)));
  const button = view.getByRole('button', { name: 'Sign in' });
  const details = view.container.querySelector('details')!;
  details.open = true;
  fireEvent.click(button);
  view.rerender(React.createElement(React.StrictMode, null, React.createElement(GuestWorkspaceNotice, { ...props, workspaceLabel: 'Personal', message: 'New message', onSignIn: () => nextCalls++ })));
  assert.equal(details.open, true);
  assert.ok(view.getByText('Personal'));
  assert.ok(view.getByText('New message'));
  fireEvent.click(button);
  assert.equal(originalCalls, 1);
  assert.equal(nextCalls, 1);
  view.unmount();
  fireEvent.click(button);
  assert.equal(nextCalls, 1);
  cleanup();
});
