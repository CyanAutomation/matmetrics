import { formatReleaseTag } from '../lib/release-tag';
import type { ReleaseEntry } from '../lib/releases';
import { escapeHtml, type ComponentController } from './component';

export interface VersionHistoryProps {
  releases: ReleaseEntry[];
  isLoading: boolean;
  error: string | null;
}

export function versionHistoryHtml(props: VersionHistoryProps): string {
  if (props.isLoading) return '<p class="version-history__message">Loading recent releases...</p>';
  if (props.error) return `<p class="version-history__error">Unable to load release history. ${escapeHtml(props.error)}</p>`;
  if (props.releases.length === 0) return '<p class="version-history__message">No recent releases are available.</p>';
  return props.releases.map((entry) => `<div class="version-history__release">
    <div class="version-history__heading"><h3>${escapeHtml(formatReleaseTag(entry.version))}</h3><p>${escapeHtml(entry.date)}</p></div>
    <div class="version-history__sections">${entry.sections.map((section) => `<div><h4>${escapeHtml(section.label)}</h4><ul>${section.items.map((item) => `<li><span class="version-history__bullet" aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul></div>`).join('')}</div>
  </div>`).join('');
}

export function mountVersionHistory(host: HTMLElement, props: VersionHistoryProps): ComponentController<VersionHistoryProps> {
  let html = versionHistoryHtml(props);
  return {
    update(next) {
      const nextHtml = versionHistoryHtml(next);
      if (nextHtml !== html) host.innerHTML = nextHtml;
      html = nextHtml;
    },
    destroy() {},
  };
}
