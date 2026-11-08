import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountTagEditor, tagEditorHtml } from './tag-editor';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('tag editor escapes values and renders labeled removal controls', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  host.innerHTML = tagEditorHtml({
    id: 'technique',
    label: 'Technique tags',
    inputLabel: 'Add a technique tag',
    itemLabel: 'technique tag',
    values: ['Uchi mata', '<O-soto & gari>'],
    newValue: '',
    placeholder: 'Add a technique',
    emptyMessage: 'Technique tags are optional.',
    onInput() {},
    onAdd() {},
    onRemove() {},
  });
  const editor = host.querySelector('[data-ui-tag-editor]')!;
  const input = editor.querySelector('input')!;
  assert.equal(editor.getAttribute('aria-label'), 'Technique tags');
  assert.equal(editor.querySelectorAll('[data-tag-value]').length, 2);
  assert.equal(editor.querySelectorAll('[data-tag-remove]').length, 2);
  const tags = editor.querySelectorAll('[data-tag-value]');
  assert.equal(tags[1].querySelector('[data-tag-text]')?.textContent, '<O-soto & gari>');
  assert.equal(input.id, 'technique-input');
  assert.equal(editor.querySelector('label')?.textContent, 'Add a technique tag');
  assert.equal(editor.querySelectorAll('[data-tag-remove]')[1].getAttribute('aria-label'), 'Remove <O-soto & gari> technique tag');
  dom.window.close();
});

test('tag editor updates values in place, handles add/remove and cleans up', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  const events: string[] = [];
  const initial = {
    id: 'technique',
    label: 'Technique tags',
    inputLabel: 'Add a technique tag',
    itemLabel: 'technique tag',
    values: ['Uchi mata'],
    newValue: '',
    placeholder: 'Add a technique',
    emptyMessage: 'Technique tags are optional.',
    onInput: (value: string) => events.push('old-input:' + value),
    onAdd: () => events.push('old-add'),
    onRemove: (value: string) => events.push('old-remove:' + value),
  };
  host.innerHTML = tagEditorHtml(initial);
  const editor = host.querySelector<HTMLElement>('[data-ui-tag-editor]')!;
  const input = editor.querySelector<HTMLInputElement>('input')!;
  const controller = mountTagEditor(editor, initial);
  controller.update({
    ...initial,
    values: ['Uchi mata', 'Seoi nage'],
    newValue: 'tai otoshi',
    addDisabled: true,
    onInput: (value) => events.push('new-input:' + value),
    onAdd: () => events.push('new-add'),
    onRemove: (value) => events.push('new-remove:' + value),
  });
  assert.equal(editor.querySelector('input'), input);
  assert.equal(input.value, 'tai otoshi');
  assert.equal(editor.querySelectorAll('[data-tag-value]').length, 2);
  assert.equal(editor.querySelector('[data-tag-add]')?.hasAttribute('disabled'), true);
  input.value = 'Harai goshi';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.deepEqual(events, ['new-input:Harai goshi']);
  const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(events, ['new-input:Harai goshi']);
  controller.update({
    ...initial,
    values: ['Uchi mata', 'Seoi nage'],
    newValue: 'Harai goshi',
    onInput: (value) => events.push('new-input:' + value),
    onAdd: () => events.push('new-add'),
    onRemove: (value) => events.push('new-remove:' + value),
  });
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  editor.querySelector<HTMLButtonElement>('[data-tag-add]')!.click();
  editor.querySelector<HTMLButtonElement>('[data-tag-remove="1"]')!.click();
  assert.deepEqual(events, ['new-input:Harai goshi', 'new-add', 'new-add', 'new-remove:Seoi nage']);
  controller.destroy();
  editor.querySelector<HTMLButtonElement>('[data-tag-remove="0"]')!.click();
  assert.equal(events.length, 4);
  assert.throws(() => controller.update({ ...initial, id: 'other' }), /stable/);
  dom.window.close();
});

test('tag editor updates the accessible remove label when the item label changes', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  const initial = {
    id: 'items',
    label: 'Items',
    inputLabel: 'Add an item',
    itemLabel: 'technique tag',
    values: ['Uchi mata'],
    newValue: '',
    placeholder: 'Add an item',
    onInput() {},
    onAdd() {},
    onRemove() {},
  };
  host.innerHTML = tagEditorHtml(initial);
  const editor = host.querySelector<HTMLElement>('[data-ui-tag-editor]')!;
  const controller = mountTagEditor(editor, initial);

  assert.equal(editor.querySelector('[data-tag-remove]')?.getAttribute('aria-label'), 'Remove Uchi mata technique tag');
  controller.update({ ...initial, itemLabel: 'topic' });
  assert.equal(editor.querySelector('[data-tag-remove]')?.getAttribute('aria-label'), 'Remove Uchi mata topic');

  dom.window.close();
});

test('tag editor keeps removal values aligned when the values array is mutated in place', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  const values = ['Alpha', 'Beta'];
  const removed: string[] = [];
  const initial = {
    id: 'items',
    label: 'Items',
    inputLabel: 'Add an item',
    values,
    newValue: '',
    placeholder: 'Add an item',
    onInput() {},
    onAdd() {},
    onRemove: (value: string) => removed.push(value),
  };
  host.innerHTML = tagEditorHtml(initial);
  const editor = host.querySelector<HTMLElement>('[data-ui-tag-editor]')!;
  const controller = mountTagEditor(editor, initial);

  values.reverse();
  editor.querySelector<HTMLButtonElement>('[data-tag-remove="0"]')!.click();
  assert.deepEqual(removed, ['Alpha']);

  controller.update({ ...initial, values });
  assert.deepEqual(
    Array.from(editor.querySelectorAll('[data-tag-text]'), (node) => node.textContent),
    ['Beta', 'Alpha']
  );
  editor.querySelector<HTMLButtonElement>('[data-tag-remove="0"]')!.click();
  assert.deepEqual(removed, ['Alpha', 'Beta']);

  dom.window.close();
});
