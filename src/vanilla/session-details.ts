import { getSafeVideoUrl, getVideoHostname } from '../lib/session-history-format';
import { escapeHtml, type ComponentController } from './component';

export interface SessionDetailsProps {
  description?: string;
  notes?: string;
  videoUrl?: string;
}

function contentHtml(props: SessionDetailsProps): string {
  const url = getSafeVideoUrl(props.videoUrl);
  return `${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="ui-session-details__video"><svg aria-hidden="true" class="ui-session-details__video-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3"/><path d="M21 14v7H3V3h7"/></svg><span>Watch relevant video</span><span class="ui-session-details__hostname">(${escapeHtml(getVideoHostname(url))})</span></a>` : ''}${props.description ? `<p class="ui-session-details__description">${escapeHtml(props.description)}</p>` : ''}${props.notes ? `<p class="ui-session-details__notes">&quot;${escapeHtml(props.notes)}&quot;</p>` : ''}`;
}

export function sessionDetailsHtml(props: SessionDetailsProps): string {
  const content = contentHtml(props);
  return `<details class="ui-session-details"${content ? '' : ' hidden'}><summary class="ui-session-details__summary"><span class="ui-session-details__label ui-session-details__label--closed">View session details</span><span class="ui-session-details__label ui-session-details__label--open">Hide session details</span></summary><div class="ui-session-details__content" data-session-details-content>${content}</div></details>`;
}

export function mountSessionDetails(host: HTMLElement, props: SessionDetailsProps): ComponentController<SessionDetailsProps> {
  const details = host.querySelector<HTMLDetailsElement>('details');
  const content = details?.querySelector<HTMLElement>('[data-session-details-content]');
  if (!details || !content) throw new Error('Session details markup is incomplete');
  let rendered = contentHtml(props);
  return {
    update(next) {
      const nextContent = contentHtml(next);
      if (nextContent !== rendered) {
        content.innerHTML = nextContent;
        rendered = nextContent;
        details.hidden = !nextContent;
      }
    },
    destroy() {},
  };
}
