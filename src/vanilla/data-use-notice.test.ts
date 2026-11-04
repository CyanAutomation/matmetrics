import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  dataUseNoticeHtml,
  mountDataUseNotice,
  type DataUseNoticeProps,
} from './data-use-notice';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('data-use notice renders the established copy as a labeled note', () => {
  const markup = dataUseNoticeHtml({ variant: 'history' });
  const dom = new JSDOM(markup);
  const notice = dom.window.document.querySelector('[data-slot="data-use-notice"]');

  assert.equal(notice?.getAttribute('role'), 'note');
  assert.equal(notice?.getAttribute('aria-label'), 'Training data use');
  assert.match(notice?.textContent ?? '', /every described session loaded in your training history/i);
  assert.match(notice?.textContent ?? '', /Suggestions don't change anything unless you edit and save a session/);
  dom.window.close();
});

test('data-use notice updates its variant and class without replacing the element', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const initial: DataUseNoticeProps = { variant: 'history', className: 'compact' };
  host.innerHTML = dataUseNoticeHtml(initial);
  const notice = host.querySelector<HTMLElement>('[data-slot="data-use-notice"]')!;
  const controller = mountDataUseNotice(notice, initial);

  controller.update({ variant: 'semantic-history-search', className: 'wide' });

  assert.equal(host.querySelector('[data-slot="data-use-notice"]'), notice);
  assert.equal(notice.className, 'ui-data-use-notice wide');
  assert.match(notice.textContent ?? '', /query and selected details for up to eight sessions/i);

  controller.destroy();
  dom.window.close();
});
