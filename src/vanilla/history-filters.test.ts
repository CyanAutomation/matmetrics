import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { historyFiltersHtml, mountHistoryFilters, type HistoryFiltersProps } from './history-filters';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('history filters update values and callbacks without replacing focused inputs, and clean up', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.querySelector('#host') as HTMLElement;
  const calls: string[] = [];
  const props: HistoryFiltersProps = {
    category: 'all', effort: 'all', fromDate: '', toDate: '', open: false,
    onCategoryChange: value => calls.push(`category:${value}`),
    onEffortChange: value => calls.push(`effort:${value}`),
    onFromDateChange: value => calls.push(`from:${value}`),
    onToDateChange: value => calls.push(`to:${value}`),
    onClear: () => calls.push('clear'),
  };
  host.innerHTML = historyFiltersHtml(props);
  const root = host.querySelector<HTMLElement>('#training-history-filters')!;
  const category = root.querySelector<HTMLSelectElement>('[aria-label="Filter by session type"]')!;
  const from = root.querySelector<HTMLInputElement>('[aria-label="Sessions from date"]')!;
  assert.equal(root.hidden, true);
  const controller = mountHistoryFilters(root, props);
  controller.update({ ...props, open: true, fromDate: '2026-01-01', onCategoryChange: value => calls.push(`new:${value}`) });
  assert.equal(root.hidden, false);
  assert.equal(from.value, '2026-01-01');
  assert.equal(root.querySelector('[aria-label="Sessions from date"]'), from);
  category.value = 'Randori';
  category.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  from.value = '2026-02-01';
  from.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  root.querySelector<HTMLButtonElement>('button')!.click();
  assert.deepEqual(calls, ['new:Randori', 'from:2026-02-01', 'clear']);
  controller.destroy();
  category.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  root.querySelector<HTMLButtonElement>('button')!.click();
  assert.equal(calls.length, 3);
  dom.window.close();
});
