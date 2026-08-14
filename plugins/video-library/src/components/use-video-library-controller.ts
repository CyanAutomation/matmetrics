import { useMemo } from 'react';

import type {
  JudoSession,
  SessionCategory,
  VideoLibraryPreferences,
} from '@/lib/types';
import {
  deriveVideoLibraryRows,
  filterVideoLibraryRows,
  getAllowedVideoDomains,
  getVideoLibraryTabCounts,
} from '@/lib/video-library';
import {
  deriveVideoLibraryBrowseState,
  deriveVideoLibraryBulkActionState,
  deriveVideoLibraryControlVisibility,
  deriveVideoLibraryEmptyState,
  getFilteredHostnameOptions,
  sortVideoLibraryRows,
  type VideoLibrarySortOption,
} from './video-library-view-model';
import type { VideoLibraryFilters } from '@/lib/video-library';

export type VideoLibraryControllerInput = {
  sessions: JudoSession[];
  customAllowedDomains: string[];
  reconciledLinkChecks: VideoLibraryPreferences['linkChecksBySessionId'];
  expectedVideoCategories: SessionCategory[];
  filters: VideoLibraryFilters;
  sortOrder: VideoLibrarySortOption;
  presentationMode: 'lounge' | 'table';
  showAdvanced: boolean;
  isCheckingLinks: boolean;
};

export function useVideoLibraryController({
  sessions,
  customAllowedDomains,
  reconciledLinkChecks,
  expectedVideoCategories,
  filters,
  sortOrder,
  presentationMode,
  showAdvanced,
  isCheckingLinks,
}: VideoLibraryControllerInput) {
  const rows = useMemo(
    () =>
      deriveVideoLibraryRows({
        sessions,
        customAllowedDomains,
        linkChecksBySessionId: reconciledLinkChecks,
        expectedVideoCategories,
      }),
    [
      sessions,
      customAllowedDomains,
      reconciledLinkChecks,
      expectedVideoCategories,
    ]
  );
  const filteredRows = useMemo(
    () => filterVideoLibraryRows(rows, filters),
    [rows, filters]
  );
  const sortedFilteredRows = useMemo(
    () => sortVideoLibraryRows(filteredRows, sortOrder),
    [filteredRows, sortOrder]
  );
  const loungeRows = useMemo(
    () => sortedFilteredRows.filter((row) => !!row.entry.url),
    [sortedFilteredRows]
  );
  const tabCounts = useMemo(() => getVideoLibraryTabCounts(rows), [rows]);
  const allowedDomains = useMemo(
    () => getAllowedVideoDomains(customAllowedDomains),
    [customAllowedDomains]
  );
  const starterDomains = allowedDomains.filter(
    (domain) => !customAllowedDomains.includes(domain)
  );
  const hostnameOptions = useMemo(
    () => getFilteredHostnameOptions(rows),
    [rows]
  );
  const summaryCounts = useMemo(
    () => ({
      total: rows.length,
      attached: rows.filter((row) => !!row.entry.url).length,
      missing: rows.filter((row) => !row.entry.url).length,
      review: tabCounts.attention,
      checked: rows.filter((row) => row.isChecked).length,
    }),
    [rows, tabCounts.attention]
  );
  const bulkActionState = deriveVideoLibraryBulkActionState({
    filteredRows,
    isCheckingLinks,
  });
  const controlVisibility = deriveVideoLibraryControlVisibility(showAdvanced);
  const hasAdvancedFiltersApplied =
    filters.status !== 'all' ||
    filters.category !== 'all' ||
    filters.hostname.length > 0 ||
    filters.checked !== 'all' ||
    presentationMode !== 'lounge' ||
    sortOrder === 'recently_checked' ||
    sortOrder === 'provider';
  const emptyState = deriveVideoLibraryEmptyState({
    tab: filters.tab,
    search: filters.search,
    hasAdvancedFiltersApplied,
  });
  const browseState = deriveVideoLibraryBrowseState({
    mode: presentationMode,
    filteredRowCount: sortedFilteredRows.length,
    loungeRowCount: loungeRows.length,
    emptyState,
  });

  return {
    rows,
    filteredRows,
    sortedFilteredRows,
    loungeRows,
    tabCounts,
    allowedDomains,
    starterDomains,
    hostnameOptions,
    summaryCounts,
    bulkActionState,
    controlVisibility,
    hasAdvancedFiltersApplied,
    browseState,
  };
}
