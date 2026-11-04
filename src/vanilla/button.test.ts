import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buttonHtml, mountButton, type ButtonProps } from './button';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('button renders an escaped label, variant, and accessible state', () => {
  const markup = buttonHtml({
    label: 'Show <filters>',
    variant: 'outline',
    ariaExpanded: false,
    ariaControls: 'training-history-filters',
    onClick: () => {},
  });

  assert.match(markup, /data-variant="outline"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-controls="training-history-filters"/);
  assert.match(markup, /Show &lt;filters&gt;/);
});

test('button updates props in place, uses the latest callback, and removes its listener', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const calls: string[] = [];
  const initial: ButtonProps = {
    label: 'Open filters',
    variant: 'outline',
    ariaExpanded: false,
    ariaControls: 'filter-region',
    onClick: () => calls.push('old'),
  };
  host.innerHTML = buttonHtml(initial);
  const button = host.querySelector<HTMLButtonElement>('button')!;
  const controller = mountButton(button, initial);

  controller.update({
    ...initial,
    label: 'Close filters',
    variant: 'primary',
    ariaExpanded: true,
    disabled: true,
    onClick: () => calls.push('new'),
  });
  assert.equal(button.textContent, 'Close filters');
  assert.equal(button.dataset.variant, 'primary');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(button.disabled, true);
  button.click();
  assert.equal(calls.length, 0);

  controller.update({
    ...initial,
    label: 'Open filters',
    onClick: () => calls.push('latest'),
  });
  assert.equal(host.querySelector('button'), button);
  button.click();
  assert.deepEqual(calls, ['latest']);

  controller.destroy();
  button.click();
  assert.deepEqual(calls, ['latest']);
  dom.window.close();
});
