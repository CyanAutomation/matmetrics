import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { actionChipListHtml, mountActionChipList, type ActionChipListProps } from './action-chip-list';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('renders escaped chips and overflow; updates callbacks and preserves focus when items are unchanged', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const calls: string[] = [];
  const props: ActionChipListProps = { items: ['<Uchi>', 'Osoto', 'Kesa', 'Newaza'], limit: 3, title: value => `Show ${value}`, onSelect: value => calls.push(value) };
  host.innerHTML = actionChipListHtml(props);
  const root = host.firstElementChild as HTMLElement;
  assert.equal(root.querySelectorAll('button').length, 3);
  assert.equal(root.querySelector('button')!.textContent, '<Uchi>');
  assert.equal(root.querySelector('button')!.title, 'Show <Uchi>');
  assert.match(root.textContent!, /\+1 more/);
  const controller = mountActionChipList(root, props);
  const first = root.querySelector('button')!;
  first.focus();
  controller.update({ ...props, onSelect: value => calls.push(`new:${value}`) });
  assert.equal(dom.window.document.activeElement, first);
  first.click();
  assert.deepEqual(calls, ['new:<Uchi>']);
  controller.update({ ...props, items: ['Tai otoshi'], limit: 3 });
  assert.equal(root.querySelectorAll('button').length, 1);
  assert.doesNotMatch(root.textContent!, /more/);
  root.querySelector('button')!.click();
  assert.deepEqual(calls, ['new:<Uchi>', 'Tai otoshi']);
  controller.destroy();
  root.querySelector('button')!.click();
  assert.equal(calls.length, 2);
  dom.window.close();
});

test('updates titles once per item when rebuilding and refreshes titles without replacing unchanged chips', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div') as HTMLElement;
  const props: ActionChipListProps = { items: ['Uchi'], limit: 3, title: value => `Show ${value}`, onSelect: () => {} };
  host.innerHTML = actionChipListHtml(props);
  const root = host.firstElementChild as HTMLElement;
  const controller = mountActionChipList(root, props);
  let calls = 0;
  controller.update({ ...props, items: ['Osoto', 'Kesa'], title: value => { calls++; return `Filter ${value}`; } });
  assert.equal(calls, 2);
  const button = root.querySelector('button')!;
  assert.equal(button.title, 'Filter Osoto');
  controller.update({ ...props, items: ['Osoto', 'Kesa'], title: value => `Find ${value}` });
  assert.equal(root.querySelector('button'), button);
  assert.equal(button.title, 'Find Osoto');
  controller.destroy();
  dom.window.close();
});
