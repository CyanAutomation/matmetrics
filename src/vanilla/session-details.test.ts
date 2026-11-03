import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { sessionDetailsHtml, mountSessionDetails } from './session-details';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('renders safe session details and escapes content', () => {
  const dom = new JSDOM(sessionDetailsHtml({ description: '<script>bad</script>', notes: 'Good & safe', videoUrl: 'https://www.example.com/watch?v=1' }));
  const doc = dom.window.document;
  assert.equal(doc.querySelector('script'), null);
  assert.match(doc.body.textContent!, /<script>bad<\/script>/);
  assert.equal(doc.querySelector('a')?.getAttribute('href'), 'https://www.example.com/watch?v=1');
  assert.match(doc.body.textContent!, /\(example.com\)/);
  assert.equal(doc.querySelector('a')?.getAttribute('rel'), 'noopener noreferrer');
  dom.window.close();
});

test('updates details without closing disclosure and rejects unsafe links', () => {
  const dom = new JSDOM('<div></div>');
  const host = dom.window.document.querySelector('div')!;
  const initial = { description: 'First', notes: '', videoUrl: 'javascript:alert(1)' };
  host.innerHTML = sessionDetailsHtml(initial);
  const controller = mountSessionDetails(host, initial);
  const details = host.querySelector('details')!;
  details.open = true;
  assert.equal(host.querySelector('a'), null);
  controller.update({ description: 'Second', notes: 'Updated', videoUrl: 'https://example.com/' });
  assert.equal(host.querySelector('details'), details);
  assert.equal(details.open, true);
  assert.match(details.textContent!, /Second/);
  assert.equal(host.querySelector('a')?.getAttribute('href'), 'https://example.com/');
  controller.update({ description: '', notes: '', videoUrl: 'javascript:alert(1)' });
  assert.equal(details.hidden, true);
  controller.destroy();
  dom.window.close();
});
