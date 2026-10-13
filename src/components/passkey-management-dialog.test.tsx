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
  HTMLInputElement: dom.window.HTMLInputElement,
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
let passkeys: Array<{ id: string; name: string | null }> = [];
let PasskeyManagementDialog: typeof import('./passkey-management-dialog').PasskeyManagementDialog;

const auth = {
  betterAuthConfigured: true,
  passkeyEnrolmentEnabled: true,
  hasBetterAuthSession: true,
  user: { email: 'avery@example.com', emailVerified: true },
  addPasskey: async (name: string) => {
    calls.push(['add', name]);
    passkeys = [...passkeys, { id: 'key-2', name }];
  },
  sendEmailVerification: async (email: string) => {
    calls.push(['verification', email]);
  },
  sendPasswordReset: async (email: string) => {
    calls.push(['password-reset', email]);
  },
};

before(async () => {
  mock.module('@/components/auth-provider', {
    namedExports: { useAuth: () => auth },
  });
  mock.module('@/lib/auth-client', {
    namedExports: {
      authClient: {
        useSession: () => ({ refetch: async () => undefined }),
        passkey: {
          listUserPasskeys: async () => ({ data: passkeys, error: null }),
          updatePasskey: async ({ id, name }: { id: string; name: string }) => {
            calls.push(['rename', id, name]);
            passkeys = passkeys.map((passkey) =>
              passkey.id === id ? { ...passkey, name } : passkey
            );
            return { data: null, error: null };
          },
          deletePasskey: async ({ id }: { id: string }) => {
            calls.push(['delete', id]);
            passkeys = passkeys.filter((passkey) => passkey.id !== id);
            return { data: null, error: null };
          },
        },
      },
    },
  });
  mock.module('@/components/ui/dialog', {
    namedExports: {
      Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
        open ? React.createElement('div', null, children) : null,
      DialogContent: ({ children }: { children: React.ReactNode }) =>
        React.createElement('section', null, children),
      DialogDescription: ({ children }: { children: React.ReactNode }) =>
        React.createElement('p', null, children),
      DialogHeader: ({ children }: { children: React.ReactNode }) =>
        React.createElement('header', null, children),
      DialogTitle: ({ children }: { children: React.ReactNode }) =>
        React.createElement('h2', null, children),
    },
  });
  ({ PasskeyManagementDialog } = await import('./passkey-management-dialog'));
});

beforeEach(() => {
  calls.length = 0;
  passkeys = [{ id: 'key-1', name: 'Laptop' }];
});

afterEach(cleanup);

function renderDialog() {
  return render(
    React.createElement(PasskeyManagementDialog, {
      open: true,
      onOpenChange: () => undefined,
    })
  );
}

test('the final registered passkey cannot be removed', async () => {
  renderDialog();
  const removeButton = await screen.findByRole('button', {
    name: 'Remove Laptop',
  });

  assert.equal(removeButton.hasAttribute('disabled'), true);
  assert.equal(removeButton.getAttribute('title'), 'Keep at least one passkey on your account');
  assert.deepEqual(calls, []);
});

test('adding an unnamed passkey assigns the next available label and refreshes the list', async () => {
  renderDialog();
  await screen.findByRole('button', { name: 'Remove Laptop' });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));

  await waitFor(() => {
    assert.deepEqual(calls, [['add', 'Passkey 2']]);
    assert.ok(screen.getByRole('button', { name: 'Remove Passkey 2' }));
  });
});

test('renaming a passkey persists the trimmed name and refreshes the list', async () => {
  renderDialog();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Rename Laptop' })
  );
  fireEvent.change(screen.getByLabelText('Passkey name'), {
    target: { value: '  Work laptop  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    assert.deepEqual(calls, [['rename', 'key-1', 'Work laptop']]);
    assert.ok(screen.getByRole('button', { name: 'Rename Work laptop' }));
  });
});
