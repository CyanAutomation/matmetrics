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
  assert.equal(details.getAttribute('aria-label'), 'Shortcuts');
  assert.equal(details.querySelector('summary')?.getAttribute('aria-label'), 'Shortcuts');
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

test('supports separate visible and accessible labels plus action tones', () => {
  const dom = new JSDOM(actionDisclosureHtml({
    label: 'Session actions',
    ariaLabel: 'Actions for Sunday training',
    triggerText: '',
    triggerIcon: 'more',
    className: 'ui-action-disclosure--menu',
    options: [{ value: 'delete', label: 'Delete session', tone: 'destructive' }],
    onAction() {},
  }));
  const details = dom.window.document.querySelector('details')!;
  const summary = details.querySelector('summary')!;
  const action = details.querySelector('button')!;

  assert.equal(details.classList.contains('ui-action-disclosure--menu'), true);
  assert.equal(summary.getAttribute('aria-label'), 'Actions for Sunday training');
  assert.equal(summary.querySelector('svg')?.getAttribute('data-icon'), 'more');
  assert.equal(summary.textContent?.trim(), 'Session actions');
  assert.equal(action.dataset.tone, 'destructive');
  dom.window.close();
});
