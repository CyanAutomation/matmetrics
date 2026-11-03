import { escapeHtml, type ComponentController } from './component';

export interface ActionChipListProps {
  items: readonly string[];
  limit: number;
  title: (item: string) => string;
  onSelect: (item: string) => void;
}

function visibleItems(props: ActionChipListProps): readonly string[] {
  return props.items.slice(0, Math.max(0, props.limit));
}

function contentsHtml(props: ActionChipListProps): string {
  const visible = visibleItems(props);
  const chips = visible.map((item, index) => `<button type="button" class="ui-action-chip-list__chip" data-chip-index="${index}" title="${escapeHtml(props.title(item))}">${escapeHtml(item)}</button>`).join('');
  const remaining = props.items.length - visible.length;
  return chips + (remaining ? `<span class="ui-action-chip-list__overflow">+${remaining} more</span>` : '');
}

/** A list of actions with an optional count for items beyond the visible limit. */
export function actionChipListHtml(props: ActionChipListProps): string {
  return `<div class="ui-action-chip-list">${contentsHtml(props)}</div>`;
}

export function mountActionChipList(root: HTMLElement, props: ActionChipListProps): ComponentController<ActionChipListProps> {
  let current = props;
  const update = (next: ActionChipListProps) => {
    const previousItems = visibleItems(current);
    const nextItems = visibleItems(next);
    const changed = previousItems.length !== nextItems.length || previousItems.some((item, index) => item !== nextItems[index]) || current.items.length - previousItems.length !== next.items.length - nextItems.length;
    current = next;
    if (changed) root.innerHTML = contentsHtml(next);
    root.querySelectorAll<HTMLButtonElement>('button[data-chip-index]').forEach((button, index) => {
      button.title = next.title(nextItems[index]);
    });
  };
  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>('button[data-chip-index]');
    if (!button || button.parentElement !== root || button.disabled) return;
    const item = visibleItems(current)[Number(button.dataset.chipIndex)];
    if (item !== undefined) current.onSelect(item);
  };
  update(props);
  root.addEventListener('click', onClick);
  return { update, destroy() { root.removeEventListener('click', onClick); } };
}
