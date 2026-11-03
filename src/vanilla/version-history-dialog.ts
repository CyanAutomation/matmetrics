import type { ReleaseEntry } from '../lib/releases';
import { type ComponentController } from './component';
import { dialogHtml, mountDialog } from './dialog';
import { mountVersionHistory, versionHistoryHtml, type VersionHistoryProps } from './version-history';

export interface VersionHistoryDialogProps {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disableDialogWrapper?: boolean;
}

const title = 'Version History';
const description = 'Recent changes across the three most recent versions';
const initialContent: VersionHistoryProps = { releases: [], isLoading: false, error: null };

export function versionHistoryDialogHtml(props: VersionHistoryDialogProps): string {
  if (props.disableDialogWrapper) {
    return `<section><h2>${title}</h2><p>${description}</p><div class="version-history" data-history-content>${versionHistoryHtml(initialContent)}</div></section>`;
  }
  return dialogHtml(
    { id: props.id, title, description },
    `<div class="version-history" data-history-content>${versionHistoryHtml(initialContent)}</div>`
  );
}

/** Owns the request and dialog lifetime, independent of the surrounding UI framework. */
export function mountVersionHistoryDialog(
  host: HTMLElement,
  initial: VersionHistoryDialogProps,
  fetchReleases: typeof fetch = fetch
): ComponentController<VersionHistoryDialogProps> {
  const content = host.querySelector<HTMLElement>('[data-history-content]');
  if (!content) throw new Error('Version history markup is incomplete');
  let props = initial;
  let releases: ReleaseEntry[] = [];
  let request: AbortController | null = null;
  let destroyed = false;
  const dialog = host.querySelector<HTMLDialogElement>('dialog');
  const dialogController = dialog ? mountDialog(dialog, initial) : null;
  // A Strict Mode remount can reuse a host whose previous instance changed it.
  content.innerHTML = versionHistoryHtml(initialContent);
  const history = mountVersionHistory(content, initialContent);

  async function load() {
    const controller = new AbortController();
    request = controller;
    history.update({ releases, isLoading: true, error: null });
    try {
      const response = await fetchReleases('/api/releases/recent', { cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted) return;
      const payload = await response.json() as { releases?: ReleaseEntry[]; error?: string; details?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload.details ?? payload.error ?? 'Unknown error');
      if (!Array.isArray(payload.releases)) throw new Error('Release history response is missing releases.');
      releases = payload.releases;
      history.update({ releases, isLoading: false, error: null });
    } catch (error) {
      if (controller.signal.aborted || destroyed) return;
      history.update({ releases, isLoading: false, error: error instanceof Error ? error.message : 'Unable to load release history.' });
    } finally {
      if (request === controller) request = null;
    }
  }

  if (props.open) void load();
  return {
    update(next) {
      const wasOpen = props.open;
      props = next;
      dialogController?.update(next);
      if (!next.open && wasOpen) {
        request?.abort();
        request = null;
      } else if (next.open && !wasOpen && releases.length === 0) {
        void load();
      }
    },
    destroy() {
      destroyed = true;
      request?.abort();
      dialogController?.destroy();
      history.destroy();
    },
  };
}
