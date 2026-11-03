import { escapeHtml, type ComponentController } from './component';

export interface StatusMessageProps {
  message: string;
  tone: 'neutral' | 'error';
}

/** Render plain text safely for server or browser use. */
export function statusMessageHtml(props: StatusMessageProps): string {
  const role = props.tone === 'error' ? 'alert' : 'status';
  return `<p class="ui-status-message" data-tone="${props.tone}" role="${role}">${escapeHtml(props.message)}</p>`;
}

export function mountStatusMessage(element: HTMLElement, props: StatusMessageProps): ComponentController<StatusMessageProps> {
  const update = (next: StatusMessageProps) => {
    const role = next.tone === 'error' ? 'alert' : 'status';
    if (element.dataset.tone !== next.tone) element.dataset.tone = next.tone;
    if (element.getAttribute('role') !== role) element.setAttribute('role', role);
    if (element.textContent !== next.message) element.textContent = next.message;
  };
  update(props);
  return { update, destroy() {} };
}
