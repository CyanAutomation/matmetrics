import { getSafeVideoUrl, getVideoHostname } from '../lib/session-history-format';
import { escapeHtml, type ComponentController } from './component';

export interface SessionDetailsProps {
  description?: string;
  notes?: string;
  videoUrl?: string;
}

function contentHtml(props: SessionDetailsProps): string {
  const url = getSafeVideoUrl(props.videoUrl);
  return `${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="inline-flex max-w-full items-center gap-2 rounded-lg bg-[hsl(var(--color-surface-container-high))] px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-[hsl(var(--color-primary-fixed)/0.16)]"><svg aria-hidden="true" class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3"/><path d="M21 14v7H3V3h7"/></svg><span class="truncate">Watch relevant video</span><span class="truncate text-xs font-normal text-muted-foreground">(${escapeHtml(getVideoHostname(url))})</span></a>` : ''}${props.description ? `<p class="text-sm text-foreground/90 whitespace-pre-wrap">${escapeHtml(props.description)}</p>` : ''}${props.notes ? `<p class="text-sm text-muted-foreground italic">&quot;${escapeHtml(props.notes)}&quot;</p>` : ''}`;
}

export function sessionDetailsHtml(props: SessionDetailsProps): string {
  const content = contentHtml(props);
  return `<details class="group mt-4 pl-7"${content ? '' : ' hidden'}><summary class="cursor-pointer select-none text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm"><span class="group-open:hidden">View session details</span><span class="hidden group-open:inline">Hide session details</span></summary><div class="mt-3 space-y-3" data-session-details-content>${content}</div></details>`;
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
      }
      details.hidden = !nextContent;
    },
    destroy() {},
  };
}
