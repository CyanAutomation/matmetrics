import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountTextField, textFieldHtml } from './text-field';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('text field renders escaped, associated label, hint and constraints', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = textFieldHtml({ id: 'password', label: '<Password>', value: '"<secret>', type: 'password', autoComplete: 'new-password', minLength: 8, maxLength: 128, required: true, hint: 'Use & keep safe', onInput() {} });
  const input = host.querySelector('input')!;
  assert.equal(host.querySelector('label')!.textContent, '<Password>');
  assert.equal(host.querySelector('label')!.htmlFor, input.id);
  assert.equal(input.value, '"<secret>');
  assert.equal(input.type, 'password');
  assert.equal(input.required, true);
  assert.equal(input.minLength, 8);
  assert.equal(input.maxLength, 128);
  assert.equal(input.getAttribute('aria-describedby'), 'password-hint');
  assert.equal(host.querySelector('#password-hint')!.textContent, 'Use & keep safe');
  dom.window.close();
});

test('field updates without replacing input, forwards input to latest callback and cleans up', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  let received = '';
  const first = { id: 'name', label: 'Name', value: '', onInput: (value: string) => { received = `old:${value}`; } };
  host.innerHTML = textFieldHtml(first);
  const input = host.querySelector('input')!;
  const controller = mountTextField(host, first);
  controller.update({ ...first, label: 'Your name', value: 'A', hint: 'Required', invalid: true, disabled: true, onInput: value => { received = `new:${value}`; } });
  assert.equal(host.querySelector('input'), input);
  assert.equal(input.value, 'A');
  assert.equal(input.disabled, true);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(input.getAttribute('aria-describedby'), 'name-hint');
  assert.equal(host.querySelector('label')!.textContent, 'Your name');
  controller.update({ ...first, value: 'A', onInput: value => { received = `new:${value}`; } });
  assert.equal(input.hasAttribute('aria-describedby'), false);
  assert.equal(input.hasAttribute('aria-invalid'), false);
  input.value = 'Ada';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(received, 'new:Ada');
  controller.destroy();
  input.value = 'Grace';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(received, 'new:Ada');
  dom.window.close();
});
