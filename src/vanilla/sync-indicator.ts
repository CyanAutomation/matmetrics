import { escapeHtml, type ComponentController } from './component';

export interface SyncIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  statusText: string;
}

function stateFor(props: SyncIndicatorProps) {
  if (!props.isOnline) return { state: 'offline', label: 'Offline', hidden: false };
  if (props.isSyncing || props.pendingCount > 0) return { state: 'syncing', label: props.statusText, hidden: false };
  return { state: 'idle', label: props.statusText, hidden: true };
}

/** Render a compact status indicator without relying on a UI framework. */
export function syncIndicatorHtml(props: SyncIndicatorProps): string {
  const { state, label, hidden } = stateFor(props);
  return `<span class="ui-sync-indicator" data-sync-indicator data-state="${state}" role="status" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${hidden ? ' hidden' : ''}><svg class="ui-sync-indicator__offline" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 20 13M5 13a10.94 10.94 0 0 1 5.17-2.39M2 8.82a15 15 0 0 1 4.18-2.64M9.88 5.13A15.16 15.16 0 0 1 22 8.82M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg><svg class="ui-sync-indicator__spinner" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 1 1-7.07 2.93"/></svg><span class="ui-sync-indicator__label" data-sync-label>${escapeHtml(label)}</span></span>`;
}

export function mountSyncIndicator(element: HTMLElement, props: SyncIndicatorProps): ComponentController<SyncIndicatorProps> {
  const labelElement = element.querySelector<HTMLElement>('[data-sync-label]');
  if (!labelElement) throw new Error('Sync indicator markup is incomplete');
  function update(next: SyncIndicatorProps) {
    const { state, label, hidden } = stateFor(next);
    if (element.dataset.state !== state) element.dataset.state = state;
    if (element.title !== label) element.title = label;
    if (element.getAttribute('aria-label') !== label) element.setAttribute('aria-label', label);
    if (labelElement!.textContent !== label) labelElement!.textContent = label;
    if (element.hidden !== hidden) element.hidden = hidden;
  }
  update(props);
  return { update, destroy() {} };
}
