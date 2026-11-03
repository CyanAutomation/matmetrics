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

test('mount synchronizes initial properties and repeated updates preserve the button', () => {
  const dom = new JSDOM('<button type="button">stale</button>');
  const button = dom.window.document.querySelector('button')!;
  let calls = 0;
  const controller = mountActionButton(button, { label: 'Ready', disabled: true, onClick: () => calls++ });
  assert.equal(button.textContent, 'Ready');
  assert.equal(button.disabled, true);
  button.click();
  assert.equal(calls, 0);
  controller.update({ label: 'Ready', onClick: () => calls++ });
  button.click();
  assert.equal(calls, 1);
  controller.destroy();
  dom.window.close();
});
