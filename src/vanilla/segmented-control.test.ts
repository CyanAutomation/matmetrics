import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountSegmentedControl, segmentedControlHtml } from './segmented-control';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('segmented control renders escaped labels and updates selection without replacing controls', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const selections: string[] = [];
  const props = { label: 'Display <mode>', value: 'compact', options: [{ value: 'compact', label: 'Compact' }, { value: 'full', label: 'Full & detailed' }], onChange: (value: string) => selections.push(value) };
  host.innerHTML = segmentedControlHtml(props);
  const group = host.querySelector<HTMLElement>('[role=group]')!;
  const buttons = [...host.querySelectorAll('button')];
  assert.equal(group.getAttribute('aria-label'), props.label);
  assert.equal(buttons[1].textContent, 'Full & detailed');
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  const controller = mountSegmentedControl(group, props);
  buttons[1].click();
  assert.deepEqual(selections, ['full']);
  controller.update({ ...props, value: 'full', onChange: (value) => selections.push(`next:${value}`) });
  assert.equal(host.querySelectorAll('button')[1], buttons[1]);
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
  buttons[0].click();
  assert.deepEqual(selections, ['full', 'next:compact']);
  controller.update({ ...props, disabled: true });
  assert.ok(buttons.every((button) => button.disabled));
  controller.destroy();
  buttons[0].disabled = false;
  buttons[0].click();
  assert.equal(selections.length, 2);
  dom.window.close();
});

test('segmented control reconciles changing options safely', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const calls: string[] = [];
  const props = { label: 'View', value: 'one', options: [{ value: 'one', label: 'One' }], onChange: (value: string) => calls.push(value) };
  host.innerHTML = segmentedControlHtml(props);
  const group = host.firstElementChild as HTMLElement;
  const controller = mountSegmentedControl(group, props);
  controller.update({ ...props, value: 'two', options: [{ value: 'two', label: '<Two>' }] });
  const button = group.querySelector('button')!;
  assert.equal(button.textContent, '<Two>');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  button.click();
  assert.deepEqual(calls, ['two']);
  controller.destroy();
  dom.window.close();
});
