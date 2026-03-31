import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveVideoLibraryControlVisibility,
  deriveVideoLibraryBrowseState,
  deriveVideoLibraryBulkActionState,
  deriveVideoLibraryEmptyState,
  getVideoLibraryReviewAlertDescription,
  sortVideoLibraryRows,
  VIDEO_LIBRARY_EMPTY_ADVANCED_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL,
  VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE,
  VIDEO_LIBRARY_LOADING_LABEL,
  VIDEO_LIBRARY_MODE_LOUNGE_LABEL,
  VIDEO_LIBRARY_MODE_TABLE_LABEL,
  VIDEO_LIBRARY_SETTINGS_BUTTON_LABEL,
} from './video-library';
import type { VideoLibraryRow } from '@/lib/video-library';
import type { JudoSession } from '@/lib/types';

function makeSession(id: string): JudoSession {
  return {
    id,
    date: '2026-03-29',
    effort: 3,
    category: 'Technical',
    techniques: ['uchi-mata'],
  };
}

function makeRow(overrides: Partial<VideoLibraryRow> = {}): VideoLibraryRow {
  return {
    session: makeSession('session-1'),
    entry: {
      session: makeSession('session-1'),
      status: 'allowed_unchecked',
      url: 'https://youtube.com/watch?v=123',
      hostname: 'youtube.com',
    },
    displayStatus: 'allowed_unchecked',
    needsReview: false,
    isCheckable: true,
    isChecked: false,
    missingVideoExpected: false,
    searchText: '2026-03-29 technical youtube.com uchi-mata',
    ...overrides,
  };
}

test('loading criterion anchor: bulk check actions show loading label and disable interaction while checking', () => {
  const state = deriveVideoLibraryBulkActionState({
    filteredRows: [makeRow()],
    isCheckingLinks: true,
  });

  assert.equal(state.canRefreshLinkHealth, false);
  assert.equal(state.refreshLinkHealthLabel, VIDEO_LIBRARY_LOADING_LABEL);
});

test('empty criterion anchor: empty state exposes clear call-to-action labels for search, tab, and empty inventory states', () => {
  const searchEmpty = deriveVideoLibraryEmptyState({
    tab: 'all',
    search: 'youtube',
    hasAdvancedFiltersApplied: false,
  });
  const tabEmpty = deriveVideoLibraryEmptyState({
    tab: 'attention',
    search: '',
    hasAdvancedFiltersApplied: false,
  });
  const inventoryEmpty = deriveVideoLibraryEmptyState({
    tab: 'all',
    search: '',
    hasAdvancedFiltersApplied: false,
  });

  assert.equal(searchEmpty.ctaLabel, VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL);
  assert.equal(searchEmpty.action, 'clearSearch');

  assert.equal(tabEmpty.ctaLabel, VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL);
  assert.equal(tabEmpty.action, 'switchToAll');

  assert.equal(inventoryEmpty.ctaLabel, VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL);
  assert.equal(inventoryEmpty.action, 'editSession');
});

test('bulk action enables refresh when any filtered rows are checkable', () => {
  const state = deriveVideoLibraryBulkActionState({
    filteredRows: [
      makeRow({
        session: makeSession('checked'),
        entry: {
          session: makeSession('checked'),
          status: 'allowed_unchecked',
          url: 'https://youtube.com/watch?v=checked',
          hostname: 'youtube.com',
        },
        isChecked: true,
      }),
      makeRow({
        session: makeSession('unchecked'),
        entry: {
          session: makeSession('unchecked'),
          status: 'allowed_unchecked',
          url: 'https://youtube.com/watch?v=unchecked',
          hostname: 'youtube.com',
        },
        isChecked: false,
      }),
      makeRow({
        session: makeSession('invalid'),
        entry: {
          session: makeSession('invalid'),
          status: 'invalid_url',
          url: 'not-a-url',
        },
        isCheckable: false,
      }),
    ],
    isCheckingLinks: false,
  });

  assert.equal(state.canRefreshLinkHealth, true);
  assert.equal(state.refreshLinkHealthLabel, 'Refresh link health');
});

test('advanced filter empty state points users to Advanced filters reset action', () => {
  const advancedEmpty = deriveVideoLibraryEmptyState({
    tab: 'all',
    search: '',
    hasAdvancedFiltersApplied: true,
  });

  assert.equal(advancedEmpty.ctaLabel, VIDEO_LIBRARY_EMPTY_ADVANCED_CTA_LABEL);
  assert.equal(advancedEmpty.action, 'resetAdvancedFilters');
  assert.match(advancedEmpty.description, /Advanced filters/i);
});

test('review alert copy focuses on actionable link issues instead of optional missing videos', () => {
  assert.equal(
    getVideoLibraryReviewAlertDescription(3),
    '3 session(s) need attention because the provider is not yet trusted, the URL is invalid, or the link could not be verified.'
  );
});

test('mode toggle browse state changes by mode while labels remain non-empty constants', () => {
  const rows = [
    makeRow({
      session: {
        ...makeSession('older'),
        date: '2026-03-01',
      },
    }),
  ];
  const tableBrowse = deriveVideoLibraryBrowseState({
    mode: 'table',
    filteredRowCount: rows.length,
    loungeRowCount: rows.length,
    emptyState: deriveVideoLibraryEmptyState({
      tab: 'all',
      search: '',
      hasAdvancedFiltersApplied: false,
    }),
  });
  const loungeBrowse = deriveVideoLibraryBrowseState({
    mode: 'lounge',
    filteredRowCount: rows.length,
    loungeRowCount: rows.length,
    emptyState: deriveVideoLibraryEmptyState({
      tab: 'all',
      search: '',
      hasAdvancedFiltersApplied: false,
    }),
  });
  const loungeEmptyWithSourceRows = deriveVideoLibraryBrowseState({
    mode: 'lounge',
    filteredRowCount: rows.length,
    loungeRowCount: 0,
    emptyState: deriveVideoLibraryEmptyState({
      tab: 'attention',
      search: '',
      hasAdvancedFiltersApplied: false,
    }),
  });
  const tableWithSourceRows = deriveVideoLibraryBrowseState({
    mode: 'table',
    filteredRowCount: rows.length,
    loungeRowCount: 0,
    emptyState: deriveVideoLibraryEmptyState({
      tab: 'attention',
      search: '',
      hasAdvancedFiltersApplied: false,
    }),
  });

  assert.ok(VIDEO_LIBRARY_MODE_TABLE_LABEL.trim().length > 0);
  assert.ok(VIDEO_LIBRARY_MODE_LOUNGE_LABEL.trim().length > 0);
  assert.equal(tableBrowse.hasRows, true);
  assert.equal(loungeBrowse.hasRows, true);
  assert.equal(tableWithSourceRows.hasRows, true);
  assert.equal(loungeEmptyWithSourceRows.hasRows, false);
  assert.equal(loungeEmptyWithSourceRows.title, VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE);
  assert.equal(
    loungeEmptyWithSourceRows.ctaLabel,
    VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL
  );
  assert.equal(loungeEmptyWithSourceRows.action, 'switchToAll');
});

test('browse-state empty behavior in lounge mode prioritizes no-playable-url guidance', () => {
  const baseEmpty = deriveVideoLibraryEmptyState({
    tab: 'all',
    search: '',
    hasAdvancedFiltersApplied: false,
  });

  const browseState = deriveVideoLibraryBrowseState({
    mode: 'lounge',
    filteredRowCount: 2,
    loungeRowCount: 0,
    emptyState: baseEmpty,
  });

  assert.equal(browseState.hasRows, false);
  assert.equal(browseState.title, VIDEO_LIBRARY_LOUNGE_EMPTY_TITLE);
  assert.equal(browseState.ctaLabel, VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL);
});

test('control tiers default to simple controls and reveal advanced panel when toggled', () => {
  const defaultTierState = deriveVideoLibraryControlVisibility(false);
  const expandedTierState = deriveVideoLibraryControlVisibility(true);

  assert.equal(defaultTierState.showCoreControls, true);
  assert.equal(defaultTierState.showAdvancedPanel, false);
  assert.equal(defaultTierState.showSettingsEntryPoint, true);
  assert.equal(defaultTierState.showInlineSettingsPanels, false);
  assert.equal(expandedTierState.showAdvancedPanel, true);
});

test('settings entry point keeps a single stable label for library configuration access', () => {
  assert.equal(VIDEO_LIBRARY_SETTINGS_BUTTON_LABEL, 'Library settings');
});

test('lounge sorting supports newest, oldest, recently checked, and provider modes', () => {
  const rows = [
    makeRow({
      session: {
        ...makeSession('mid'),
        date: '2026-03-15',
      },
      entry: {
        session: makeSession('mid'),
        status: 'allowed_unchecked',
        url: 'https://youtube.com/watch?v=mid',
        hostname: 'youtube.com',
      },
      latestCheck: {
        url: 'https://youtube.com/watch?v=mid',
        hostname: 'youtube.com',
        checkedAt: '2026-03-16T10:00:00.000Z',
        status: 'reachable',
      },
    }),
    makeRow({
      session: {
        ...makeSession('new'),
        date: '2026-03-20',
      },
      entry: {
        session: makeSession('new'),
        status: 'allowed_unchecked',
        url: 'https://vimeo.com/123',
        hostname: 'vimeo.com',
      },
      latestCheck: {
        url: 'https://vimeo.com/123',
        hostname: 'vimeo.com',
        checkedAt: '2026-03-25T10:00:00.000Z',
        status: 'reachable',
      },
    }),
  ];

  assert.deepEqual(
    sortVideoLibraryRows(rows, 'newest').map((row) => row.session.id),
    ['new', 'mid']
  );
  assert.deepEqual(
    sortVideoLibraryRows(rows, 'oldest').map((row) => row.session.id),
    ['mid', 'new']
  );
  assert.deepEqual(
    sortVideoLibraryRows(rows, 'recently_checked').map((row) => row.session.id),
    ['new', 'mid']
  );
  assert.deepEqual(
    sortVideoLibraryRows(rows, 'provider').map((row) => row.entry.hostname),
    ['vimeo.com', 'youtube.com']
  );
});
