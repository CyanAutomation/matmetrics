import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountSelectField, selectFieldHtml } from './select-field';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('select field escapes content, labels the control, and reflects selection', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = selectFieldHtml({ id: 'type', label: '<Type>', value: 'a', options: [{ value: 'a', label: '<A>' }], onChange() {} });
  const select = host.querySelector('select')!;
  assert.equal(host.querySelector('label')?.textContent, '<Type>');
  assert.equal(host.querySelector('label')?.htmlFor, select.id);
  assert.equal(select.options[0].textContent, '<A>');
  assert.equal(select.value, 'a');
  dom.window.close();
});

test('updates options, state and callback without replacing the select; destroy removes listener', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  let received = '';
  const props = { id: 'type', label: 'Type', value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], onChange: (value: string) => { received = value; } };
  host.innerHTML = selectFieldHtml(props);
  const select = host.querySelector('select')!;
  const controller = mountSelectField(host, props);
  select.value = 'b';
  select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(received, 'b');
  controller.update({ ...props, label: 'Category', value: 'c', options: [{ value: 'c', label: 'C' }], disabled: true, hint: 'Choose one', onChange: value => { received = `new:${value}`; } });
  assert.equal(host.querySelector('select'), select);
  assert.equal(select.value, 'c');
  assert.equal(select.disabled, true);
  assert.equal(select.getAttribute('aria-describedby'), 'type-hint');
  assert.equal(host.querySelector('label')?.textContent, 'Category');
  controller.update({ ...props, value: 'a', onChange: value => { received = `new:${value}`; } });
  assert.equal(select.hasAttribute('aria-describedby'), false);
  select.value = 'b';
  select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(received, 'new:b');
  controller.destroy();
  select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(received, 'new:b');
  assert.throws(() => controller.update({ ...props, id: 'other' }), /stable/);
  dom.window.close();
});
