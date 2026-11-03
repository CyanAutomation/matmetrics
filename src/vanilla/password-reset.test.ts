import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountPasswordReset, passwordResetHtml } from './password-reset';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('reset form validates, submits once, reports completion and removes listeners', async () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  let resolveReset!: () => void;
  const calls: string[][] = [];
  const props = { token: 'token', hasError: false, configured: true, resetPassword: (token: string, password: string) => { calls.push([token, password]); return new Promise<void>(resolve => { resolveReset = resolve; }); }, errorMessage: () => 'Reset failed' };
  host.innerHTML = passwordResetHtml(props);
  const controller = mountPasswordReset(host, props);
  const inputs = host.querySelectorAll('input');
  const form = host.querySelector('form')!;
  const enter = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const submit = () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  enter(inputs[0], 'short'); enter(inputs[1], 'short'); submit();
  assert.equal(calls.length, 0);
  enter(inputs[0], 'correct-password'); enter(inputs[1], 'different-password');
  assert.equal(inputs[1].getAttribute('aria-invalid'), 'true');
  assert.equal(host.querySelector('button')!.disabled, true);
  enter(inputs[1], 'correct-password'); submit(); submit();
  assert.deepEqual(calls, [['token', 'correct-password']]);
  assert.equal(host.querySelector('button')!.disabled, true);
  resolveReset(); await tick();
  assert.match(host.textContent!, /Password updated/);
  assert.equal(host.querySelector('a')!.getAttribute('href'), '/');
  controller.destroy(); submit();
  assert.equal(calls.length, 1);
  dom.window.close();
});

test('reset screen handles unavailable and invalid links and failure safely', async () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  const props = { token: null, hasError: false, configured: true, resetPassword: async () => { throw new Error('failed'); }, errorMessage: () => '<failed>' };
  host.innerHTML = passwordResetHtml(props);
  const controller = mountPasswordReset(host, props);
  assert.match(host.textContent!, /invalid or expired/);
  controller.update({ ...props, configured: false });
  assert.match(host.textContent!, /unavailable/);
  controller.update({ ...props, token: 'valid' });
  const inputs = host.querySelectorAll('input');
  for (const input of inputs) { input.value = 'valid-password'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }
  host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(host.querySelector('[role="alert"]')!.textContent!.includes('<failed>'), true);
  assert.equal(host.querySelector('failed'), null);
  assert.equal(host.querySelector('button')!.disabled, false);
  controller.destroy(); dom.window.close();
});

test('a stale request cannot overwrite a changed or destroyed screen', async () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  let finish!: () => void;
  const props = { token: 'old', hasError: false, configured: true, resetPassword: () => new Promise<void>(resolve => { finish = resolve; }), errorMessage: () => 'Failed' };
  host.innerHTML = passwordResetHtml(props);
  const controller = mountPasswordReset(host, props);
  for (const input of host.querySelectorAll('input')) { input.value = 'valid-password'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }
  host.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  controller.update({ ...props, token: null });
  finish(); await tick();
  assert.match(host.textContent!, /invalid or expired/);
  controller.destroy(); dom.window.close();
});
