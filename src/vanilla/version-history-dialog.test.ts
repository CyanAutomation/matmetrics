import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { mountVersionHistoryDialog, versionHistoryDialogHtml } from './version-history-dialog';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('loads releases once, retains them on reopening, and requests close', async () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const proto = dom.window.HTMLDialogElement.prototype;
  proto.showModal = function () { this.setAttribute('open', ''); };
  proto.close = function () { this.removeAttribute('open'); };
  let calls = 0;
  let closeRequests = 0;
  const props = { id: 'history', open: false, onOpenChange: (open: boolean) => { if (!open) closeRequests++; } };
  host.innerHTML = versionHistoryDialogHtml(props);
  const component = mountVersionHistoryDialog(host, props, async () => {
    calls++;
    return { ok: true, json: async () => ({ releases: [{ version: '2.0.0', date: '2026-01-01', sections: [{ label: 'Fixes', items: ['A fix'] }] }] }) } as Response;
  });
  assert.equal(calls, 0);
  component.update({ ...props, open: true });
  assert.match(host.textContent!, /Loading recent releases/);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(host.textContent!, /A fix/);
  host.querySelector<HTMLButtonElement>('[data-dialog-close]')!.click();
  assert.equal(closeRequests, 1);
  component.update(props);
  component.update({ ...props, open: true });
  assert.equal(calls, 1);
  component.destroy();
  dom.window.close();
});

test('closing aborts a pending request and reopening retries without accepting the stale response', async () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const props = { id: 'history', open: true, onOpenChange: () => {}, disableDialogWrapper: true };
  host.innerHTML = versionHistoryDialogHtml(props);
  const pending: Array<{ signal: AbortSignal; resolve: (response: Response) => void }> = [];
  const component = mountVersionHistoryDialog(host, props, (_input, init) => new Promise(resolve => pending.push({ signal: init!.signal as AbortSignal, resolve })));
  component.update({ ...props, open: false });
  assert.equal(pending[0].signal.aborted, true);
  component.update(props);
  assert.equal(pending.length, 2);
  pending[0].resolve({ ok: true, json: async () => ({ releases: [{ version: 'stale', date: '', sections: [] }] }) } as Response);
  pending[1].resolve({ ok: false, json: async () => ({ error: 'Unavailable' }) } as Response);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(host.textContent!, /Unable to load release history.*Unavailable/);
  assert.doesNotMatch(host.textContent!, /stale/);
  component.destroy();
  dom.window.close();
});
