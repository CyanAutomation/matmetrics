import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountNotice, noticeHtml } from './notice';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
test('notice escapes content, announces errors and updates without replacing its element', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  host.innerHTML = noticeHtml({ title: '<Title>', message: '<script>bad</script>', tone: 'error' });
  const notice = host.firstElementChild as HTMLElement;
  assert.equal(notice.getAttribute('role'), 'alert');
  assert.equal(notice.querySelector('script'), null);
  assert.equal(notice.textContent, '<Title><script>bad</script>');
  const controller = mountNotice(notice, { title: 'Warning', message: 'Try again', tone: 'warning' });
  assert.equal(host.firstElementChild, notice);
  assert.equal(notice.getAttribute('role'), 'status');
  assert.equal(notice.dataset.tone, 'warning');
  assert.equal(notice.textContent, 'WarningTry again');
  controller.destroy(); dom.window.close();
});
