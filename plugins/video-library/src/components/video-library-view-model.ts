import { SESSION_CATEGORIES, type SessionCategory } from '@/lib/types';
import type {
  VideoDomainRemovalImpact,
  VideoLibraryRow,
  VideoLibraryStatusFilter,
  VideoLibraryTab,
} from '@/lib/video-library';

export interface VideoLibraryProps {
  onRefresh: () => void;
}

export type DomainRemovalDialogState = {
  domain: string;
  impact: VideoDomainRemovalImpact;
};

export type EmptyStateDescriptor = {
  title: string;
  description: string;
  ctaLabel: string;
  action:
    | 'clearSearch'
    | 'switchToAll'
    | 'resetAdvancedFilters'
    | 'editSession';
};

export type VideoLibraryPresentationMode = 'table' | 'lounge';
export type VideoLibrarySortOption =
  | 'newest'
  | 'oldest'
  | 'recently_checked'
  | 'provider';

export const SESSION_CATEGORY_OPTIONS: SessionCategory[] = [
  ...SESSION_CATEGORIES,
];

export const VIDEO_LIBRARY_LOADING_LABEL = 'Checking...';
export const VIDEO_LIBRARY_MODE_TABLE_LABEL = 'Table';
export const VIDEO_LIBRARY_MODE_LOUNGE_LABEL = 'Gallery';
export const VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL = 'Clear search';
export const VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL = 'View all sessions';
export const VIDEO_LIBRARY_EMPTY_ADVANCED_CTA_LABEL = 'Reset Advanced filters';
export const VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL = 'Edit or log a session';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CONFIRM_LABEL = 'Remove domain';
export const VIDEO_LIBRARY_REMOVE_DOMAIN_CANCEL_LABEL = 'Cancel';
export const VIDEO_LIBRARY_SETTINGS_BUTTON_LABEL = 'Library settings';
export const VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE = 'No linked videos in this view';
const VIDEO_LIBRARY_LOUNGE_EMPTY_DESCRIPTION =
  'This filtered set has sessions, but none currently have a playable URL.';

export function getVideoLibraryReviewAlertDescription(reviewCount: number) {
  return `${reviewCount} session(s) need attention because the provider is not yet trusted, the URL is invalid, or the link could not be verified.`;
}

const VIDEO_LIBRARY_STATUS_LABELS: Record<VideoLibraryStatusFilter, string> = {
  all: 'All statuses',
  missing: 'No linked video',
  allowed_unchecked: 'Allowed',
  disallowed_domain: 'Provider not yet trusted',
  invalid_url: 'Invalid URL',
  reachable: 'Reachable',
  broken: 'Broken',
  check_failed: "Couldn't verify link",
};

export function getEntryStatusLabel(status: VideoLibraryStatusFilter) {
  return VIDEO_LIBRARY_STATUS_LABELS[status];
}

export function getStatusVariant(status: VideoLibraryStatusFilter) {
  switch (status) {
    case 'broken':
    case 'invalid_url':
    case 'disallowed_domain':
      return 'destructive';
    case 'reachable':
      return 'secondary';
    case 'allowed_unchecked':
    case 'check_failed':
    case 'all':
      return 'outline';
    default:
      return 'outline';
  }
}

export function getPresentationLabel(mode: VideoLibraryPresentationMode) {
  return mode === 'table'
    ? VIDEO_LIBRARY_MODE_TABLE_LABEL
    : VIDEO_LIBRARY_MODE_LOUNGE_LABEL;
}

export function getSortLabel(sort: VideoLibrarySortOption) {
  switch (sort) {
    case 'newest':
      return 'Newest';
    case 'oldest':
      return 'Oldest';
    case 'recently_checked':
      return 'Recently checked';
    case 'provider':
      return 'Provider';
  }
}

function toTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortVideoLibraryRows(
  rows: VideoLibraryRow[],
  sort: VideoLibrarySortOption
): VideoLibraryRow[] {
  return [...rows].sort((left, right) => {
    const leftDate = toTimestamp(left.session.date);
    const rightDate = toTimestamp(right.session.date);
    const leftCheckedAt = toTimestamp(left.latestCheck?.checkedAt);
    const rightCheckedAt = toTimestamp(right.latestCheck?.checkedAt);
    const leftHost = (
      left.entry.hostname ??
      left.latestCheck?.hostname ??
      ''
    ).trim();
    const rightHost = (
      right.entry.hostname ??
      right.latestCheck?.hostname ??
      ''
    ).trim();

    switch (sort) {
      case 'newest':
        return (
          rightDate - leftDate ||
          left.session.id.localeCompare(right.session.id)
        );
      case 'oldest':
        return (
          leftDate - rightDate ||
          left.session.id.localeCompare(right.session.id)
        );
      case 'recently_checked':
        return (
          rightCheckedAt - leftCheckedAt ||
          rightDate - leftDate ||
          left.session.id.localeCompare(right.session.id)
        );
      case 'provider':
        return (
          leftHost.localeCompare(rightHost) ||
          rightDate - leftDate ||
          left.session.id.localeCompare(right.session.id)
        );
    }
  });
}

export function deriveVideoLibraryBrowseState({
  mode,
  filteredRowCount,
  loungeRowCount,
  emptyState,
}: {
  mode: VideoLibraryPresentationMode;
  filteredRowCount: number;
  loungeRowCount: number;
  emptyState: EmptyStateDescriptor;
}): Pick<
  EmptyStateDescriptor,
  'title' | 'description' | 'ctaLabel' | 'action'
> & {
  hasRows: boolean;
} {
  if (mode === 'lounge') {
    if (loungeRowCount > 0) {
      return { ...emptyState, hasRows: true };
    }

    if (filteredRowCount > 0) {
      return {
        title: VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE,
        description: VIDEO_LIBRARY_LOUNGE_EMPTY_DESCRIPTION,
        ctaLabel: emptyState.ctaLabel,
        action: emptyState.action,
        hasRows: false,
      };
    }
  }

  return {
    ...emptyState,
    hasRows: filteredRowCount > 0,
  };
}

export function deriveVideoLibraryEmptyState({
  tab,
  search,
  hasAdvancedFiltersApplied,
}: {
  tab: VideoLibraryTab;
  search: string;
  hasAdvancedFiltersApplied: boolean;
}): EmptyStateDescriptor {
  if (search.trim()) {
    return {
      title: 'No matching video sessions',
      description:
        'No rows match your current search and filters. Clear the search to widen the view.',
      ctaLabel: VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL,
      action: 'clearSearch',
    };
  }

  if (hasAdvancedFiltersApplied) {
    return {
      title: 'No sessions match these advanced filters',
      description:
        'No rows match the current Advanced filters. Open Advanced filters to adjust or reset them.',
      ctaLabel: VIDEO_LIBRARY_EMPTY_ADVANCED_CTA_LABEL,
      action: 'resetAdvancedFilters',
    };
  }

  if (tab !== 'all') {
    return {
      title: 'Nothing to review here',
      description:
        'This tab is currently empty. Switch to the full inventory to inspect all sessions.',
      ctaLabel: VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL,
      action: 'switchToAll',
    };
  }

  return {
    title: 'No saved videos yet',
    description:
      'Edit a session or log a new one to add video links when they are useful.',
    ctaLabel: VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL,
    action: 'editSession',
  };
}

export function deriveVideoLibraryBulkActionState({
  filteredRows,
  isCheckingLinks,
}: {
  filteredRows: VideoLibraryRow[];
  isCheckingLinks: boolean;
}) {
  const checkableRows = filteredRows.filter((row) => row.isCheckable);

  return {
    canRefreshLinkHealth: !isCheckingLinks && checkableRows.length > 0,
    disabledMessage:
      isCheckingLinks || checkableRows.length > 0
        ? null
        : 'No checkable links match the current filters.',
    refreshLinkHealthLabel: isCheckingLinks
      ? VIDEO_LIBRARY_LOADING_LABEL
      : 'Refresh link health',
  };
}

export function buildVideoDomainRemovalConfirmationDescription(
  impact: VideoDomainRemovalImpact
): string {
  if (impact.affectedSessionCount === 0) {
    return `Remove ${impact.domain} from your custom allowlist?`;
  }

  return `Removing ${impact.domain} will move ${impact.affectedSessionCount} session(s) into the disallowed-domain review state.`;
}

export function getTabLabel(tab: VideoLibraryTab) {
  switch (tab) {
    case 'watchable':
      return 'Watchable';
    case 'attention':
      return 'Needs attention';
    case 'no_video':
      return 'No video';
    case 'all':
      return 'All';
  }
}

export function getFilteredHostnameOptions(rows: VideoLibraryRow[]): string[] {
  return Array.from(
    new Set(
      rows
        .map((row) => row.entry.hostname ?? row.latestCheck?.hostname ?? '')
        .filter((hostname) => hostname.length > 0)
    )
  ).sort();
}

export function deriveVideoLibraryControlVisibility(showAdvanced: boolean) {
  return {
    showCoreControls: true,
    showAdvancedPanel: showAdvanced,
    showSettingsEntryPoint: true,
    showInlineSettingsPanels: false,
  };
}
