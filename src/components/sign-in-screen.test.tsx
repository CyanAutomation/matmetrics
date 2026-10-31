import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, before, beforeEach, mock } from 'node:test';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator,
});

const React = require('react') as typeof import('react');
const { cleanup, fireEvent, render, screen, waitFor } =
  require('@testing-library/react') as typeof import('@testing-library/react');

const calls: Array<[string, ...string[]]> = [];
const toastCalls: unknown[] = [];
let authFailure: Error | null = null;
let SignInScreen: typeof import('./sign-in-screen').SignInScreen;

const auth = {
  isConfigured: true,
  betterAuthConfigured: true,
  emailPasswordSignupEnabled: true,
  signInWithPasskey: async () => {
    calls.push(['passkey']);
  },
  signInWithEmail: async (email: string, password: string) => {
    calls.push(['sign-in', email, password]);
    if (authFailure) throw authFailure;
  },
  signUpWithEmail: async (name: string, email: string, password: string) => {
    calls.push(['sign-up', name, email, password]);
  },
  sendPasswordReset: async (email: string) => {
    calls.push(['password-reset', email]);
  },
  sendEmailVerification: async (email: string) => {
    calls.push(['verification', email]);
  },
};

const feedback = {
  feedbackState: 'idle',
  startLoading: () => undefined,
  showSuccess: () => undefined,
  showError: () => undefined,
};

before(async () => {
  mock.module('@/components/auth-provider', {
    namedExports: { useAuth: () => auth },
  });
  mock.module('@/hooks/use-toast', {
    namedExports: {
      useToast: () => ({ toast: (value: unknown) => toastCalls.push(value) }),
    },
  });
  mock.module('@/hooks/use-action-feedback', {
    namedExports: { useActionFeedback: () => feedback },
  });
  ({ SignInScreen } = await import('./sign-in-screen'));
});

beforeEach(() => {
  calls.length = 0;
  toastCalls.length = 0;
  authFailure = null;
});

afterEach(cleanup);

function renderSignInScreen(onAuthenticated = () => undefined) {
  return render(
    React.createElement(SignInScreen, {
      onContinueAsGuest: () => undefined,
      onAuthenticated,
    })
  );
}

test('email sign-in authenticates with the entered credentials and continues', async () => {
  let continued = 0;
  renderSignInScreen(() => {
    continued += 1;
  });

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-horse-battery' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  await waitFor(() => {
    assert.deepEqual(calls, [
      ['sign-in', 'user@example.com', 'correct-horse-battery'],
    ]);
  });
  assert.equal(continued, 1);
});

test('password reset moves to the verification state and can resend verification', async () => {
  renderSignInScreen();
  fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  assert.equal(screen.queryByLabelText('Password'), null);

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }));

  await waitFor(() => {
    assert.deepEqual(calls, [['password-reset', 'user@example.com']]);
    assert.ok(screen.getByRole('heading', { name: 'Check your inbox' }));
  });

  fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
  await waitFor(() => {
    assert.deepEqual(calls, [
      ['password-reset', 'user@example.com'],
      ['verification', 'user@example.com'],
    ]);
  });
});

test('sign-up collects a display name and moves to the verification state', async () => {
  renderSignInScreen();
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  fireEvent.change(screen.getByLabelText('Display name'), {
    target: { value: 'Avery' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'avery@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'correct-horse-battery' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

  await waitFor(() => {
    assert.deepEqual(calls, [
      ['sign-up', 'Avery', 'avery@example.com', 'correct-horse-battery'],
    ]);
    assert.ok(screen.getByRole('heading', { name: 'Check your inbox' }));
  });
});

test('sign-in errors stay beside the form instead of appearing as a snackbar', async () => {
  authFailure = new Error('The credentials were rejected.');
  renderSignInScreen();

  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'user@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'wrong-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  const error = await screen.findByRole('alert');
  assert.match(error.textContent ?? '', /credentials were rejected/i);
  assert.equal(toastCalls.length, 0);
});
