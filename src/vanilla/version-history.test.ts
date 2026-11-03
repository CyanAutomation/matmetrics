import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { versionHistoryHtml, mountVersionHistory } from './version-history';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('version history renders loading, error, empty, and escaped release data', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const initial = { releases: [], isLoading: true, error: null };
  host.innerHTML = versionHistoryHtml(initial);
  const controller = mountVersionHistory(host, initial);
  assert.match(host.textContent!, /Loading recent releases/);
  assert.equal(host.querySelector('.ui-status-message')?.getAttribute('role'), 'status');
  controller.update({ ...initial, isLoading: false, error: '<offline>' });
  assert.match(host.textContent!, /<offline>/);
  assert.equal(host.querySelector('.ui-status-message')?.getAttribute('role'), 'alert');
  assert.equal(host.querySelector('offline'), null);
  controller.update({ ...initial, isLoading: false });
  assert.match(host.textContent!, /No recent releases/);
  controller.update({ isLoading: false, error: null, releases: [{ version: '2.0.0', date: '2026-03-30', sections: [{ label: 'Fixes', items: ['<unsafe>'] }] }] });
  assert.equal(host.querySelector('h3')?.textContent, 'v2.0');
  assert.equal(host.querySelector('li')?.textContent?.trim(), '<unsafe>');
  assert.equal(host.querySelector('unsafe'), null);
  controller.destroy();
  dom.window.close();
});
