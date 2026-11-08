import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountTextField, textFieldHtml } from './text-field';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('text field renders escaped, associated label, hint and constraints', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = textFieldHtml({ id: 'password', label: '<Password>', value: '"<secret>', type: 'password', autoComplete: 'new-password', minLength: 8, maxLength: 128, required: true, showRequiredIndicator: true, hint: 'Use & keep safe', onInput() {} });
  const input = host.querySelector('input')!;
  assert.equal(host.querySelector('[data-field-label-text]')!.textContent, '<Password>');
  assert.equal(host.querySelector('label')!.htmlFor, input.id);
  assert.equal(input.value, '"<secret>');
  assert.equal(input.type, 'password');
  assert.equal(input.required, true);
  assert.equal(host.querySelector('[data-field-required]')?.textContent, ' *');
  assert.equal(host.querySelector('[data-field-optional]')?.textContent, '');
  assert.equal(input.minLength, 8);
  assert.equal(input.maxLength, 128);
  assert.equal(input.getAttribute('aria-describedby'), 'password-hint');
  assert.equal(host.querySelector('#password-hint')!.textContent, 'Use & keep safe');
  dom.window.close();
});

test('text field supports date and numeric inputs with native attributes', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = textFieldHtml({
    id: 'session-duration',
    label: 'Duration (minutes)',
    value: '90',
    type: 'number',
    name: 'sessionDuration',
    ariaLabel: 'Session duration in minutes',
    placeholder: '90',
    title: 'How long was your practice session in minutes?',
    min: 1,
    max: 999,
    step: 1,
    optional: true,
    size: 'comfortable',
    surface: 'background',
    onInput() {},
  });
  const input = host.querySelector('input')!;
  assert.equal(input.type, 'number');
  assert.equal(input.name, 'sessionDuration');
  assert.equal(input.getAttribute('aria-label'), 'Session duration in minutes');
  assert.equal(input.placeholder, '90');
  assert.equal(input.title, 'How long was your practice session in minutes?');
  assert.equal(input.min, '1');
  assert.equal(input.max, '999');
  assert.equal(input.step, '1');
  assert.equal(host.querySelector('.ui-text-field__optional')?.textContent, 'optional');
  assert.equal(input.dataset.size, 'comfortable');
  assert.equal(input.dataset.surface, 'background');
  assert.equal(host.querySelector('label')?.htmlFor, input.id);
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
  assert.equal(host.querySelector('[data-field-label-text]')!.textContent, 'Your name');
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

test('required and optional label markers track updated field props', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  const initial = {
    id: 'profile',
    label: 'Display name',
    value: '',
    optional: true,
    onInput() {},
  };
  host.innerHTML = textFieldHtml(initial);
  const controller = mountTextField(host, initial);
  const optional = host.querySelector('[data-field-optional]') as HTMLElement;
  const required = host.querySelector('[data-field-required]') as HTMLElement;

  assert.equal(optional.textContent, 'optional');
  assert.equal(optional.hidden, false);
  assert.equal(required.textContent, '');
  assert.equal(required.hidden, true);

  controller.update({ ...initial, optional: false, required: true, showRequiredIndicator: true });
  assert.equal(optional.textContent, '');
  assert.equal(optional.hidden, true);
  assert.equal(required.textContent, ' *');
  assert.equal(required.hidden, false);
  assert.equal(host.querySelector('label')?.textContent, 'Display name *');

  dom.window.close();
});
