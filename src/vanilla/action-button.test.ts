import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { actionButtonHtml, mountActionButton } from './action-button';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('action button escapes labels, updates its callback and disabled state, and cleans up', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  let calls = 0;
  const props = { label: '<Sign in>', onClick: () => calls++ };
  host.innerHTML = actionButtonHtml(props);
  const button = host.querySelector('button')!;
  assert.equal(button.textContent, '<Sign in>');
  assert.equal(button.type, 'button');
  const controller = mountActionButton(button, props);
  button.click();
  controller.update({ label: 'Wait', disabled: true, onClick: () => calls += 10 });
  button.click();
  assert.equal(calls, 1);
  controller.update({ label: 'Continue', onClick: () => calls += 10 });
  button.click();
  assert.equal(calls, 11);
  controller.destroy();
  button.click();
  assert.equal(calls, 11);
  dom.window.close();
});
