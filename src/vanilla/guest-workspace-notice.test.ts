import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
import { guestWorkspaceNoticeHtml, mountGuestWorkspaceNotice } from './guest-workspace-notice';

test('notice renders escaped content and updates without losing disclosure state', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  let calls = 0;
  const initial = { workspaceLabel: '<Demo>', message: 'About & more', signInButtonText: 'Sign in', onSignIn: () => calls++ };
  host.innerHTML = guestWorkspaceNoticeHtml(initial);
  assert.equal(host.querySelector('[data-notice-label]')?.textContent, '<Demo>');
  assert.equal(host.querySelector('details')?.open, false);
  const notice = mountGuestWorkspaceNotice(host, initial);
  const details = host.querySelector('details')!;
  details.open = true;
  host.querySelector('button')!.click();
  assert.equal(calls, 1);
  let updatedCalls = 0;
  notice.update({ ...initial, workspaceLabel: 'Workspace', message: 'Updated', onSignIn: () => updatedCalls++ });
  assert.equal(details.open, true);
  assert.equal(host.querySelector('[data-notice-label]')?.textContent, 'Workspace');
  assert.equal(host.querySelector('[data-notice-message]')?.textContent, 'Updated');
  host.querySelector('button')!.click();
  assert.equal(calls, 1);
  assert.equal(updatedCalls, 1);
  notice.destroy();
  host.querySelector('button')!.click();
  assert.equal(updatedCalls, 1);
});
