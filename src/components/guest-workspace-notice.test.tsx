import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Next bundles this parser without publishing type declarations.
import { parse } from 'next/dist/compiled/node-html-parser';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { GuestWorkspaceNotice } from './guest-workspace-notice';

test('guest notice keeps its status and sign-in action visible while deferring explanation', () => {
  const document = parse(
    renderToStaticMarkup(
      React.createElement(GuestWorkspaceNotice, {
        workspaceLabel: 'Demo Preview',
        message:
          'You are browsing a seeded preview workspace. Start editing to make it your own.',
        signInButtonText: 'Sign in to unlock more',
        onSignIn: () => undefined,
      })
    )
  );
  const notice = document.querySelector('[role="status"]');
  const disclosure = notice?.querySelector('details');

  assert.ok(notice);
  assert.match(notice?.textContent ?? '', /Guest access is active/);
  assert.match(notice?.textContent ?? '', /Demo Preview/);
  assert.match(notice?.textContent ?? '', /Sign in to unlock more/);
  assert.ok(disclosure);
  assert.equal(disclosure?.hasAttribute('open'), false);
  assert.match(disclosure?.textContent ?? '', /seeded preview workspace/i);
});
