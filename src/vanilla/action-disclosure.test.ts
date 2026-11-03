import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { actionDisclosureHtml, mountActionDisclosure } from './action-disclosure';

const options = [{ value: 'week', label: 'This week' }, { value: 'month', label: 'Last 30 days' }];

test('renders escaped text in a closed, accessible native disclosure', () => {
  const dom = new JSDOM(actionDisclosureHtml({ label: '<Filters>', options: [{ value: '"x', label: '<Week>' }], onAction() {} }));
  const details = dom.window.document.querySelector('details')!;
  assert.equal(details.open, false);
  assert.equal(details.getAttribute('aria-label'), '<Filters>');
  assert.equal(details.querySelector('summary')?.textContent?.trim(), '<Filters>');
  assert.equal(details.querySelector('button')?.textContent, '<Week>');
  assert.equal(details.querySelector('button')?.dataset.actionValue, '"x');
});

test('updates actions and callbacks without closing the disclosure or replacing unchanged buttons; cleans up', () => {
  const calls: string[] = [];
  const initial = { label: 'Quick filters', options, onAction: (value: string) => calls.push(`old:${value}`) };
  const dom = new JSDOM(actionDisclosureHtml(initial));
  const details = dom.window.document.querySelector('details')!;
  const controller = mountActionDisclosure(details, initial);
  const button = details.querySelector('button')!;
  details.open = true;
  button.focus();
  button.click();
  controller.update({ ...initial, label: 'Shortcuts', onAction: value => calls.push(`new:${value}`) });
  assert.equal(details.open, true);
  assert.equal(details.querySelector('button'), button);
  assert.equal(dom.window.document.activeElement, button);
  button.click();
  controller.update({ ...initial, options: [{ value: 'effort', label: 'High effort', disabled: true }] });
  const replacement = details.querySelector('button')!;
  assert.equal(replacement.disabled, true);
  replacement.click();
  controller.destroy();
  button.click();
  replacement.disabled = false;
  replacement.click();
  assert.deepEqual(calls, ['old:week', 'new:week']);
});
