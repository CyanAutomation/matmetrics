import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountRadioGroup, radioGroupHtml } from './radio-group';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('radio group renders escaped labels and native mutually exclusive controls', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  host.innerHTML = radioGroupHtml({
    id: 'effort',
    label: 'Effort <level>',
    summary: 'Normal',
    value: '3',
    layout: 'responsive',
    options: [
      { value: '1', label: 'Easy' },
      { value: '3', label: 'Normal & steady' },
    ],
    onChange() {},
  });
  const group = host.querySelector('fieldset')!;
  const radios = host.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  assert.equal(group.querySelector('[data-radio-label]')?.textContent, 'Effort <level>');
  assert.equal(group.getAttribute('data-layout'), 'responsive');
  assert.equal(radios.length, 2);
  assert.equal(radios[0].name, 'effort');
  assert.equal(radios[0].checked, false);
  assert.equal(radios[1].checked, true);
  assert.equal(host.querySelector('label[for="effort-1"]')?.textContent, 'Normal & steady');
  dom.window.close();
});

test('radio group updates in place, forwards changes and cleans up', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  const selected: string[] = [];
  const initial = {
    id: 'effort',
    label: 'Effort level',
    summary: 'Normal',
    value: '3',
    layout: 'responsive' as const,
    options: [
      { value: '1', label: 'Easy' },
      { value: '3', label: 'Normal' },
      { value: '5', label: 'Intense' },
    ],
    onChange: (value: string) => selected.push('old:' + value),
  };
  host.innerHTML = radioGroupHtml(initial);
  const group = host.querySelector('fieldset') as HTMLFieldSetElement;
  const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const controller = mountRadioGroup(group, initial);
  controller.update({
    ...initial,
    value: '5',
    summary: 'Intense',
    options: initial.options.map((option) => ({ ...option, disabled: option.value === '1' })),
    onChange: (value) => selected.push('new:' + value),
  });
  assert.equal(host.querySelector('fieldset'), group);
  assert.equal(group.querySelectorAll('input[type="radio"]')[2], radios[2]);
  assert.equal(radios[2].checked, true);
  assert.equal(radios[0].disabled, true);
  assert.equal(group.querySelector('[data-radio-summary]')?.textContent, 'Intense');
  radios[1].checked = true;
  radios[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(selected, ['new:3']);
  controller.destroy();
  radios[0].checked = true;
  radios[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(selected, ['new:3']);
  assert.throws(() => controller.update({ ...initial, id: 'other' }), /stable/);
  dom.window.close();
});
