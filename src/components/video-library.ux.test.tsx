import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveVideoLibraryBulkActionState,
  deriveVideoLibraryEmptyState,
  VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL,
  VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL,
  VIDEO_LIBRARY_LOADING_LABEL,
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

function makeRow(
  overrides: Partial<VideoLibraryRow> = {}
): VideoLibraryRow {
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
    searchText: '2026-03-29 technical youtube.com uchi-mata',
    ...overrides,
  };
}

test('loading criterion anchor: bulk check actions show loading label and disable interaction while checking', () => {
  const state = deriveVideoLibraryBulkActionState({
    filteredRows: [makeRow()],
    isCheckingLinks: true,
  });

  assert.equal(state.canCheckFiltered, false);
  assert.equal(state.canCheckUnchecked, false);
  assert.equal(state.checkFilteredLabel, VIDEO_LIBRARY_LOADING_LABEL);
  assert.equal(state.checkUncheckedLabel, VIDEO_LIBRARY_LOADING_LABEL);
});

test('empty criterion anchor: empty state exposes clear call-to-action labels for search, tab, and empty inventory states', () => {
  const searchEmpty = deriveVideoLibraryEmptyState({
    tab: 'all',
    search: 'youtube',
  });
  const tabEmpty = deriveVideoLibraryEmptyState({
    tab: 'review',
    search: '',
  });
  const inventoryEmpty = deriveVideoLibraryEmptyState({
    tab: 'all',
    search: '',
  });

  assert.equal(searchEmpty.ctaLabel, VIDEO_LIBRARY_EMPTY_SEARCH_CTA_LABEL);
  assert.equal(searchEmpty.action, 'clearSearch');

  assert.equal(tabEmpty.ctaLabel, VIDEO_LIBRARY_EMPTY_ALL_CTA_LABEL);
  assert.equal(tabEmpty.action, 'switchToAll');

  assert.equal(inventoryEmpty.ctaLabel, VIDEO_LIBRARY_EMPTY_ADD_CTA_LABEL);
  assert.equal(inventoryEmpty.action, 'editSession');
});

test('bulk actions only enable when rows are checkable and unchecked state exists', () => {
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

  assert.equal(state.canCheckFiltered, true);
  assert.equal(state.canCheckUnchecked, true);
  assert.equal(state.checkFilteredLabel, 'Check filtered');
  assert.equal(state.checkUncheckedLabel, 'Check unchecked');
});
