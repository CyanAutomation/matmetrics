import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountTextarea, textareaHtml } from './textarea';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('textarea renders escaped content, labels, hints and native constraints', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = textareaHtml({
    id: 'practice',
    name: 'practiceDescription',
    label: '<Practice notes>',
    value: '<throws & drills>',
    placeholder: 'Add notes',
    required: true,
    minLength: 2,
    maxLength: 5000,
    rows: 5,
    hint: 'One or two sentences is enough.',
    size: 'large',
    surface: 'background',
    onInput() {},
  });
  const textarea = host.querySelector('textarea')!;
  assert.equal(host.querySelector('label')?.textContent, '<Practice notes>');
  assert.equal(host.querySelector('label')?.htmlFor, textarea.id);
  assert.equal(textarea.value, '<throws & drills>');
  assert.equal(textarea.name, 'practiceDescription');
  assert.equal(textarea.placeholder, 'Add notes');
  assert.equal(textarea.required, true);
  assert.equal(textarea.minLength, 2);
  assert.equal(textarea.maxLength, 5000);
  assert.equal(textarea.rows, 5);
  assert.equal(textarea.getAttribute('aria-describedby'), 'practice-hint');
  assert.equal(host.querySelector('#practice-hint')?.textContent, 'One or two sentences is enough.');
  assert.equal(textarea.dataset.size, 'large');
  assert.equal(textarea.dataset.surface, 'background');
  dom.window.close();
});

test('textarea updates in place, forwards current props and removes listeners', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  let received = '';
  const initial = {
    id: 'practice',
    value: '',
    ariaLabel: 'Practice notes',
    onInput: (value: string) => { received = 'old:' + value; },
  };
  host.innerHTML = textareaHtml(initial);
  const textarea = host.querySelector('textarea')!;
  const controller = mountTextarea(host, initial);
  controller.update({
    ...initial,
    value: 'Uchi mata',
    disabled: true,
    invalid: true,
    hint: 'Please review these notes.',
    onInput: (value) => { received = 'new:' + value; },
  });
  assert.equal(host.querySelector('textarea'), textarea);
  assert.equal(textarea.value, 'Uchi mata');
  assert.equal(textarea.disabled, true);
  assert.equal(textarea.getAttribute('aria-invalid'), 'true');
  assert.equal(textarea.getAttribute('aria-describedby'), 'practice-hint');
  textarea.value = 'Seoi nage';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(received, 'new:Seoi nage');
  controller.destroy();
  textarea.value = 'O-soto-gari';
  textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(received, 'new:Seoi nage');
  assert.throws(
    () => controller.update({ ...initial, id: 'other' }),
    /stable/
  );
  dom.window.close();
});
