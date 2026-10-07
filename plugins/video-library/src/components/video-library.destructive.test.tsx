import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { afterEach, before, mock } from 'node:test';

import {
  buildVideoDomainRemovalConfirmationDescription,
} from './video-library-view-model';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLFormElement: dom.window.HTMLFormElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  DocumentFragment: dom.window.DocumentFragment,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
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
const noOp = () => undefined;
const authState = {
  user: { uid: 'user-1' },
  preferences: {
    videoLibrary: {
      customAllowedDomains: ['club.example.com'],
      linkChecksBySessionId: {},
      expectedVideoCategories: ['Technical'],
    },
  },
  canSavePreferences: true,
  authAvailable: true,
};
const savedPreferences: Array<{
  userId: string;
  videoLibrary: { customAllowedDomains?: string[] };
}> = [];
let VideoLibrary: typeof import('./video-library-panel').VideoLibrary;

before(async () => {
  mock.module('@/components/auth-provider', {
    namedExports: { useAuth: () => authState },
  });
  mock.module('@/hooks/use-toast', {
    namedExports: { useToast: () => ({ toast: noOp }) },
  });
  mock.module('@/lib/storage', {
    namedExports: {
      getSessions: () => [],
      updateSession: async () => undefined,
    },
  });
  mock.module('@/lib/user-preferences', {
    namedExports: {
      saveVideoLibraryPreference: async (
        userId: string,
        videoLibrary: { customAllowedDomains?: string[] }
      ) => {
        savedPreferences.push({ userId, videoLibrary });
      },
    },
  });
  mock.module('@/lib/auth-session', {
    namedExports: { getAuthHeaders: async () => ({}) },
  });
  mock.module('@/components/session-log-form', {
    namedExports: { SessionLogForm: () => null },
  });

  ({ VideoLibrary } = await import('./video-library-panel'));
});

afterEach(cleanup);

test('destructive criterion anchor: removing a domain warns when sessions would become disallowed', () => {
  const description = buildVideoDomainRemovalConfirmationDescription({
    domain: 'club.example.com',
    affectedSessionCount: 2,
    affectedSessionIds: ['session-1', 'session-2'],
  });

  assert.match(description, /Removing club\.example\.com/i);
  assert.match(description, /2 session\(s\)/i);
});

test('destructive criterion anchor: cancel keeps the domain and confirm removes it', async () => {
  savedPreferences.length = 0;
  render(React.createElement(VideoLibrary, { onRefresh: noOp }));

  fireEvent.click(screen.getByRole('button', { name: 'Library settings' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove club.example.com' })
  );

  const dialog = screen.getByRole('dialog', { name: 'Remove custom domain?' });
  assert.equal(
    screen.getByRole('heading', { name: 'Remove custom domain?' }).textContent,
    'Remove custom domain?'
  );
  assert.match(dialog.textContent ?? '', /club\.example\.com/);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  assert.equal(
    screen.queryByRole('dialog', { name: 'Remove custom domain?' }),
    null
  );
  assert.equal(savedPreferences.length, 0);

  fireEvent.click(
    screen.getByRole('button', { name: 'Remove club.example.com' })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove domain' }));

  await waitFor(() => assert.equal(savedPreferences.length, 1));
  assert.equal(savedPreferences[0]?.userId, 'user-1');
  assert.deepEqual(savedPreferences[0]?.videoLibrary.customAllowedDomains, []);
});
