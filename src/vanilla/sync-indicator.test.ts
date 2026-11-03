import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountSyncIndicator, syncIndicatorHtml } from './sync-indicator';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('sync indicator safely renders and transitions between online, offline and pending states', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const initial = { isOnline: true, isSyncing: false, pendingCount: 0, statusText: 'Synced' };
  host.innerHTML = syncIndicatorHtml(initial);
  const indicator = host.querySelector<HTMLElement>('[data-sync-indicator]')!;
  assert.equal(indicator.hidden, true);
  const controller = mountSyncIndicator(indicator, initial);
  controller.update({ ...initial, isOnline: false, statusText: '<unsafe>' });
  assert.equal(indicator.hidden, false);
  assert.equal(indicator.dataset.state, 'offline');
  assert.equal(indicator.getAttribute('aria-label'), 'Offline');
  assert.equal(indicator.querySelector('[data-sync-label]')?.textContent, 'Offline');
  controller.update({ ...initial, pendingCount: 2, statusText: '2 pending <items>' });
  assert.equal(indicator.dataset.state, 'syncing');
  assert.equal(indicator.getAttribute('title'), '2 pending <items>');
  assert.equal(indicator.querySelector('[data-sync-label]')?.textContent, '2 pending <items>');
  assert.equal(indicator.querySelector('items'), null);
  controller.update(initial);
  assert.equal(indicator.hidden, true);
  controller.destroy();
  dom.window.close();
});

test('initial markup escapes externally supplied status text', () => {
  const dom = new JSDOM(syncIndicatorHtml({ isOnline: true, isSyncing: true, pendingCount: 0, statusText: 'Syncing "<now>"' }));
  const indicator = dom.window.document.querySelector('[data-sync-indicator]') as HTMLElement;
  assert.equal(indicator.getAttribute('title'), 'Syncing "<now>"');
  assert.equal(indicator.querySelector('now'), null);
  dom.window.close();
});
