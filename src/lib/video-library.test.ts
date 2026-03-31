import assert from 'node:assert/strict';
import test from 'node:test';

import { isBlockedNetworkHostname } from '@/lib/network-safety';
import type { JudoSession, VideoLinkCheckSnapshot } from '@/lib/types';
import {
  areVideoLinkCheckMapsEqual,
  deriveVideoLibraryEntries,
  deriveVideoLibraryRows,
  filterVideoLibraryRows,
  getAllowedVideoDomains,
  getVideoDomainRemovalImpact,
  getVideoLibraryTabCounts,
  matchesAllowedVideoDomain,
  mergeVideoLinkCheckResults,
  normalizeVideoDomainInput,
  reconcileVideoLinkChecks,
} from '@/lib/video-library';

function makeSession(id: string, videoUrl?: string): JudoSession {
  return {
    id,
    date: '2026-03-29',
    effort: 3,
    category: 'Technical',
    techniques: ['uchi-mata'],
    ...(videoUrl ? { videoUrl } : {}),
  };
}

function makeSnapshot(
  overrides: Partial<VideoLinkCheckSnapshot> = {}
): VideoLinkCheckSnapshot {
  return {
    url: 'https://youtube.com/watch?v=123',
    hostname: 'youtube.com',
    status: 'reachable',
    checkedAt: '2026-03-29T10:00:00.000Z',
    ...overrides,
  };
}

test('normalizeVideoDomainInput accepts bare hostnames only', () => {
  assert.equal(normalizeVideoDomainInput('YouTube.com'), 'youtube.com');
  assert.equal(
    normalizeVideoDomainInput('https://youtube.com/watch?v=1'),
    null
  );
  assert.equal(normalizeVideoDomainInput('example.com:443'), null);
  assert.equal(normalizeVideoDomainInput(''), null);
});

test('getAllowedVideoDomains merges starter and custom domains', () => {
  assert.deepEqual(getAllowedVideoDomains(['coach.example.com']), [
    'coach.example.com',
    'vimeo.com',
    'youtu.be',
    'youtube.com',
  ]);
});

test('matchesAllowedVideoDomain supports exact and subdomain suffix matches', () => {
  assert.equal(matchesAllowedVideoDomain('youtube.com', 'youtube.com'), true);
  assert.equal(matchesAllowedVideoDomain('m.youtube.com', 'youtube.com'), true);
  assert.equal(
    matchesAllowedVideoDomain('notyoutube.com', 'youtube.com'),
    false
  );
});

test('deriveVideoLibraryEntries classifies missing, allowed, and disallowed domains', () => {
  const entries = deriveVideoLibraryEntries(
    [
      makeSession('missing'),
      makeSession('allowed', 'https://www.youtube.com/watch?v=123'),
      makeSession('disallowed', 'https://example.com/video/123'),
      makeSession('invalid', 'not-a-url'),
    ],
    []
  );

  assert.deepEqual(
    entries.map((entry) => [entry.session.id, entry.status, entry.hostname]),
    [
      ['missing', 'missing', undefined],
      ['allowed', 'allowed_unchecked', 'youtube.com'],
      ['disallowed', 'disallowed_domain', 'example.com'],
      ['invalid', 'invalid_url', undefined],
    ]
  );
});

test('deriveVideoLibraryEntries and API hostname policy classify hosts identically', () => {
  const hostCases = [
    'LOCALHOST.',
    '[::1]',
    '127.0.0.2',
    '100.64.0.1',
    'metadata.google.internal.',
    'EXAMPLE.com.',
    '[2606:4700:4700::1111]',
  ];

  const entries = deriveVideoLibraryEntries(
    hostCases.map((host, index) =>
      makeSession(`host-${index}`, `https://${host}/watch?v=${index}`)
    ),
    []
  );

  for (const [index, host] of hostCases.entries()) {
    const normalizedHost = new URL(`https://${host}`).hostname;
    const isBlockedInApi = isBlockedNetworkHostname(normalizedHost);
    const isBlockedInUi = entries[index]?.status === 'invalid_url';
    assert.equal(
      isBlockedInUi,
      isBlockedInApi,
      `expected UI and API policy parity for ${host}`
    );
  }
});

test('reconcileVideoLinkChecks drops stale entries when session URL changes or becomes invalid', () => {
  const reconciled = reconcileVideoLinkChecks({
    sessions: [
      makeSession('same', 'https://youtube.com/watch?v=123'),
      makeSession('changed', 'https://youtube.com/watch?v=999'),
      makeSession('invalid', 'not-a-url'),
    ],
    customAllowedDomains: [],
    linkChecksBySessionId: {
      same: makeSnapshot(),
      changed: makeSnapshot(),
      invalid: makeSnapshot({ url: 'https://youtube.com/watch?v=invalid' }),
    },
  });

  assert.deepEqual(Object.keys(reconciled), ['same']);
});

test('reconcileVideoLinkChecks invalidates disallowed-domain snapshots when custom allowlist changes', () => {
  const disallowedSnapshot = makeSnapshot({
    url: 'https://coach.example.com/video/42',
    hostname: 'coach.example.com',
    status: 'disallowed_domain',
  });

  const reconciled = reconcileVideoLinkChecks({
    sessions: [makeSession('coach', 'https://coach.example.com/video/42')],
    customAllowedDomains: ['example.com'],
    linkChecksBySessionId: {
      coach: disallowedSnapshot,
    },
  });

  assert.deepEqual(reconciled, {});
});

test('deriveVideoLibraryRows merges persisted latest checks and review state', () => {
  const rows = deriveVideoLibraryRows({
    sessions: [
      makeSession('reachable', 'https://youtube.com/watch?v=123'),
      makeSession('broken', 'https://youtube.com/watch?v=456'),
      makeSession('missing'),
    ],
    customAllowedDomains: [],
    linkChecksBySessionId: {
      reachable: makeSnapshot(),
      broken: makeSnapshot({
        url: 'https://youtube.com/watch?v=456',
        status: 'broken',
        checkedAt: '2026-03-29T11:00:00.000Z',
      }),
    },
    expectedVideoCategories: ['Technical'],
  });

  assert.equal(rows[0]?.displayStatus, 'reachable');
  assert.equal(rows[1]?.needsReview, true);
  assert.equal(rows[2]?.displayStatus, 'missing');
  assert.equal(rows[2]?.needsReview, false);
});

test('filterVideoLibraryRows respects tab, search, status, and checked filters', () => {
  const rows = deriveVideoLibraryRows({
    sessions: [
      makeSession('reachable', 'https://youtube.com/watch?v=123'),
      makeSession('broken', 'https://youtube.com/watch?v=456'),
      makeSession('missing'),
    ],
    customAllowedDomains: [],
    linkChecksBySessionId: {
      reachable: makeSnapshot(),
      broken: makeSnapshot({
        url: 'https://youtube.com/watch?v=456',
        status: 'broken',
      }),
    },
    expectedVideoCategories: ['Technical'],
  });

  const attentionRows = filterVideoLibraryRows(rows, {
    tab: 'attention',
    search: '',
    status: 'all',
    category: 'all',
    hostname: '',
    checked: 'all',
  });
  assert.deepEqual(
    attentionRows.map((row) => row.session.id),
    ['broken']
  );

  const checkedBrokenRows = filterVideoLibraryRows(rows, {
    tab: 'all',
    search: 'youtube',
    status: 'broken',
    category: 'all',
    hostname: '',
    checked: 'checked',
  });
  assert.deepEqual(
    checkedBrokenRows.map((row) => row.session.id),
    ['broken']
  );
});

test('getVideoLibraryTabCounts returns grouped counts', () => {
  const rows = deriveVideoLibraryRows({
    sessions: [
      makeSession('reachable', 'https://youtube.com/watch?v=123'),
      makeSession('broken', 'https://youtube.com/watch?v=456'),
      makeSession('missing'),
    ],
    customAllowedDomains: [],
    linkChecksBySessionId: {
      reachable: makeSnapshot(),
      broken: makeSnapshot({
        url: 'https://youtube.com/watch?v=456',
        status: 'broken',
      }),
    },
    expectedVideoCategories: ['Technical'],
  });

  assert.deepEqual(getVideoLibraryTabCounts(rows), {
    all: 3,
    watchable: 1,
    attention: 1,
    no_video: 1,
  });
});

test('no-video tab/count only include categories marked as expected', () => {
  const rows = deriveVideoLibraryRows({
    sessions: [
      makeSession('tech-missing'),
      {
        ...makeSession('randori-missing'),
        category: 'Randori',
      },
    ],
    customAllowedDomains: [],
    linkChecksBySessionId: {},
    expectedVideoCategories: ['Technical'],
  });

  assert.deepEqual(getVideoLibraryTabCounts(rows), {
    all: 2,
    watchable: 0,
    attention: 0,
    no_video: 1,
  });

  const noVideoRows = filterVideoLibraryRows(rows, {
    tab: 'no_video',
    search: '',
    status: 'all',
    category: 'all',
    hostname: '',
    checked: 'all',
  });

  assert.deepEqual(
    noVideoRows.map((row) => row.session.id),
    ['tech-missing']
  );
});

test('getVideoDomainRemovalImpact counts sessions that would become disallowed', () => {
  const impact = getVideoDomainRemovalImpact({
    domain: 'club.example.com',
    sessions: [
      makeSession('club', 'https://media.club.example.com/one'),
      makeSession('youtube', 'https://youtube.com/watch?v=123'),
    ],
    customAllowedDomains: ['club.example.com'],
  });

  assert.equal(impact.affectedSessionCount, 1);
  assert.deepEqual(impact.affectedSessionIds, ['club']);
});

test('mergeVideoLinkCheckResults and equality helper support persisted updates', () => {
  const existing = {
    keep: makeSnapshot(),
  };
  const merged = mergeVideoLinkCheckResults({
    existing,
    results: [
      {
        sessionId: 'new',
        url: 'https://youtube.com/watch?v=789',
        hostname: 'youtube.com',
        status: 'check_failed',
        checkedAt: '2026-03-29T12:00:00.000Z',
        error: 'timeout',
      },
    ],
  });

  assert.equal(areVideoLinkCheckMapsEqual(existing, merged), false);
  assert.equal(merged.new?.status, 'check_failed');
  assert.equal(
    areVideoLinkCheckMapsEqual(merged, {
      keep: makeSnapshot(),
      new: {
        url: 'https://youtube.com/watch?v=789',
        hostname: 'youtube.com',
        status: 'check_failed',
        checkedAt: '2026-03-29T12:00:00.000Z',
        error: 'timeout',
      },
    }),
    true
  );
});
