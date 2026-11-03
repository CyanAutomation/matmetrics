import { escapeHtml, type ComponentController } from './component';

export interface NoticeProps {
  title: string;
  message: string;
  tone: 'neutral' | 'warning' | 'error';
}

export function noticeHtml({ title, message, tone }: NoticeProps): string {
  return `<div class="ui-notice" data-tone="${tone}" role="${tone === 'error' ? 'alert' : 'status'}"><strong data-notice-title>${escapeHtml(title)}</strong><p data-notice-message>${escapeHtml(message)}</p></div>`;
}

export function mountNotice(element: HTMLElement, props: NoticeProps): ComponentController<NoticeProps> {
  const title = element.querySelector<HTMLElement>('[data-notice-title]');
  const message = element.querySelector<HTMLElement>('[data-notice-message]');
  if (!title || !message) throw new Error('Notice markup is incomplete');
  const update = (next: NoticeProps) => {
    title.textContent = next.title;
    message.textContent = next.message;
    element.dataset.tone = next.tone;
    element.setAttribute('role', next.tone === 'error' ? 'alert' : 'status');
  };
  update(props);
  return { update, destroy() {} };
}
