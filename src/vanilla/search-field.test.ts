import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { mountSearchField, searchFieldHtml, type SearchFieldProps } from './search-field';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('search field escapes values and exposes an accessible name', () => {
  const markup = searchFieldHtml({
    id: 'session-search',
    label: 'Search training history',
    value: '<throws>',
    placeholder: 'Search "notes"',
    onInput: () => {},
  });

  assert.match(markup, /type="search"/);
  assert.match(markup, /aria-label="Search training history"/);
  assert.match(markup, /value="&lt;throws&gt;"/);
  assert.match(markup, /placeholder="Search &quot;notes&quot;"/);
});

test('search field updates in place, uses the latest callback, and cleans up', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const calls: string[] = [];
  const initial: SearchFieldProps = {
    id: 'session-search',
    label: 'Search training history',
    value: '',
    placeholder: 'Search techniques or notes',
    onInput: (value) => calls.push(`old:${value}`),
  };
  host.innerHTML = searchFieldHtml(initial);
  const input = host.querySelector<HTMLInputElement>('input')!;
  const controller = mountSearchField(host, initial);

  input.focus();
  controller.update({
    ...initial,
    value: 'new value',
    onInput: (value) => calls.push(`new:${value}`),
  });

  assert.equal(host.querySelector('input'), input);
  assert.equal(dom.window.document.activeElement, input);
  assert.equal(input.value, 'new value');

  input.value = 'typed query';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.deepEqual(calls, ['new:typed query']);

  controller.destroy();
  input.value = 'ignored';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.deepEqual(calls, ['new:typed query']);
  dom.window.close();
});

test('search field requires its id to stay stable while mounted', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const initial: SearchFieldProps = {
    id: 'session-search',
    label: 'Search training history',
    value: '',
    onInput: () => {},
  };
  host.innerHTML = searchFieldHtml(initial);
  const controller = mountSearchField(host, initial);

  assert.throws(
    () => controller.update({ ...initial, id: 'another-search' }),
    /id must remain stable/
  );

  controller.destroy();
  dom.window.close();
});
