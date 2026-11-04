import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { badgeHtml, mountBadge } from './badge';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('renders semantic variants and escapes badge content', () => {
  const dom = new JSDOM(badgeHtml({ label: '<Technical>', variant: 'technical' }));
  const badge = dom.window.document.querySelector('[data-ui-badge]')!;

  assert.equal(badge.classList.contains('ui-badge--technical'), true);
  assert.equal(badge.textContent, '<Technical>');
  assert.equal(badge.querySelector('technical'), null);
  dom.window.close();
});

test('updates a badge in place without replacing its host element', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = badgeHtml({ label: 'Technical', variant: 'technical' });
  const badge = host.firstElementChild as HTMLElement;
  const controller = mountBadge(badge, { label: 'Randori', variant: 'randori' });

  assert.equal(host.firstElementChild, badge);
  assert.equal(badge.classList.contains('ui-badge--randori'), true);
  assert.equal(badge.classList.contains('ui-badge--technical'), false);
  assert.equal(badge.textContent, 'Randori');

  controller.destroy();
  dom.window.close();
});
