import { EFFORT_LABELS, SESSION_CATEGORIES } from '../lib/types';
import { actionButtonHtml, mountActionButton } from './action-button';
import { escapeHtml, type ComponentController } from './component';

export interface HistoryFiltersProps {
  category: string;
  effort: string;
  fromDate: string;
  toDate: string;
  open: boolean;
  onCategoryChange: (value: string) => void;
  onEffortChange: (value: string) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onClear: () => void;
}

const categories = [{ value: 'all', label: 'All session types' }, ...SESSION_CATEGORIES.map(value => ({ value, label: value }))];
const efforts = [{ value: 'all', label: 'All effort levels' }, ...([1, 2, 3, 4, 5] as const).map(value => ({ value: String(value), label: EFFORT_LABELS[value] }))];
function optionsHtml(options: ReadonlyArray<{ value: string; label: string }>, selected: string) {
  return options.map(option => `<option value="${escapeHtml(option.value)}"${option.value === selected ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
}

/** The advanced controls share the same DOM and state throughout the migration. */
export function historyFiltersHtml(props: HistoryFiltersProps): string {
  return `<div id="training-history-filters" class="ui-history-filters"${props.open ? '' : ' hidden'}><select class="ui-history-filters__control" aria-label="Filter by session type" data-filter-category>${optionsHtml(categories, props.category)}</select><select class="ui-history-filters__control" aria-label="Filter by effort level" data-filter-effort>${optionsHtml(efforts, props.effort)}</select><input class="ui-history-filters__control" type="date" aria-label="Sessions from date" data-filter-from value="${escapeHtml(props.fromDate)}"><input class="ui-history-filters__control" type="date" aria-label="Sessions to date" data-filter-to value="${escapeHtml(props.toDate)}">${actionButtonHtml({ label: 'Clear filters', onClick: props.onClear }, 'ui-history-filters__clear')}</div>`;
}

export function mountHistoryFilters(root: HTMLElement, props: HistoryFiltersProps): ComponentController<HistoryFiltersProps> {
  const category = root.querySelector<HTMLSelectElement>('[data-filter-category]');
  const effort = root.querySelector<HTMLSelectElement>('[data-filter-effort]');
  const from = root.querySelector<HTMLInputElement>('[data-filter-from]');
  const to = root.querySelector<HTMLInputElement>('[data-filter-to]');
  const button = root.querySelector<HTMLButtonElement>('button');
  if (!category || !effort || !from || !to || !button) throw new Error('History filter markup is incomplete');
  let current = props;
  const clear = mountActionButton(button, { label: 'Clear filters', onClick: () => current.onClear() });
  const onCategory = () => current.onCategoryChange(category.value);
  const onEffort = () => current.onEffortChange(effort.value);
  const onFrom = () => current.onFromDateChange(from.value);
  const onTo = () => current.onToDateChange(to.value);
  category.addEventListener('change', onCategory);
  effort.addEventListener('change', onEffort);
  from.addEventListener('input', onFrom);
  to.addEventListener('input', onTo);
  const update = (next: HistoryFiltersProps) => {
    current = next;
    root.hidden = !next.open;
    if (category.value !== next.category) category.value = next.category;
    if (effort.value !== next.effort) effort.value = next.effort;
    if (from.value !== next.fromDate) from.value = next.fromDate;
    if (to.value !== next.toDate) to.value = next.toDate;
  };
  update(props);
  return { update, destroy() {
    category.removeEventListener('change', onCategory);
    effort.removeEventListener('change', onEffort);
    from.removeEventListener('input', onFrom);
    to.removeEventListener('input', onTo);
    clear.destroy();
  } };
}
