import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { mountStatusMessage, statusMessageHtml } from './status-message';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('status message escapes content and updates its semantics without replacing the element', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const initial = { message: '<Loading & waiting>', tone: 'neutral' as const };
  host.innerHTML = statusMessageHtml(initial);
  const message = host.querySelector('p')!;
  assert.equal(message.textContent, initial.message);
  assert.equal(message.querySelector('loading'), null);
  assert.equal(message.getAttribute('role'), 'status');
  const controller = mountStatusMessage(message, initial);
  controller.update({ message: 'Could not load', tone: 'error' });
  assert.equal(host.querySelector('p'), message);
  assert.equal(message.getAttribute('role'), 'alert');
  assert.equal(message.dataset.tone, 'error');
  assert.equal(message.textContent, 'Could not load');
  controller.update(initial);
  assert.equal(message.getAttribute('role'), 'status');
  controller.destroy();
  dom.window.close();
});
