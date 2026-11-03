import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, before, mock } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLFormElement: dom.window.HTMLFormElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render, screen, waitFor } = require('@testing-library/react') as typeof import('@testing-library/react');
const calls: string[][] = [];
let PasswordResetScreen: typeof import('./password-reset-screen').PasswordResetScreen;

before(async () => {
  mock.module('@/components/auth-provider', { namedExports: { useAuth: () => ({ betterAuthConfigured: true, resetPassword: async (token: string, password: string) => { calls.push([token, password]); } }) } });
  ({ PasswordResetScreen } = await import('./password-reset-screen'));
});
afterEach(() => { cleanup(); calls.length = 0; });

test('password reset validates matching values and submits the entered password', async () => {
  render(React.createElement(React.StrictMode, null, React.createElement(PasswordResetScreen, { token: 'token', hasError: false })));
  const password = screen.getByLabelText('New password') as HTMLInputElement;
  const confirmation = screen.getByLabelText('Confirm password') as HTMLInputElement;
  const submit = screen.getByRole('button', { name: 'Update password' }) as HTMLButtonElement;
  assert.equal(password.autocomplete, 'new-password');
  assert.equal(password.required, true);
  fireEvent.input(password, { target: { value: 'correct-password' } });
  fireEvent.input(confirmation, { target: { value: 'different-password' } });
  assert.equal(submit.disabled, true);
  assert.equal(confirmation.getAttribute('aria-invalid'), 'true');
  assert.equal(screen.getByText('Passwords do not match.').id, confirmation.getAttribute('aria-describedby'));
  fireEvent.input(confirmation, { target: { value: 'correct-password' } });
  assert.equal(submit.disabled, false);
  fireEvent.submit(submit.closest('form')!);
  await waitFor(() => assert.deepEqual(calls, [['token', 'correct-password']]));
  await screen.findByText('Password updated');
});

test('an invalid reset link does not display password inputs', () => {
  render(React.createElement(PasswordResetScreen, { token: null, hasError: false }));
  assert.ok(screen.getByText('This password link is invalid or expired'));
  assert.equal(screen.queryByLabelText('New password'), null);
});
