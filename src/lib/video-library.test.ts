import assert from 'node:assert/strict';
import test from 'node:test';

import type { JudoSession } from '@/lib/types';
import {
  deriveVideoLibraryEntries,
  getAllowedVideoDomains,
  matchesAllowedVideoDomain,
  normalizeVideoDomainInput,
} from '@/lib/video-library';

function makeSession(
  id: string,
  videoUrl?: string
): JudoSession {
  return {
    id,
    date: '2026-03-29',
    effort: 3,
    category: 'Technical',
    techniques: ['uchi-mata'],
    ...(videoUrl ? { videoUrl } : {}),
  };
}

test('normalizeVideoDomainInput accepts bare hostnames only', () => {
  assert.equal(normalizeVideoDomainInput('YouTube.com'), 'youtube.com');
  assert.equal(normalizeVideoDomainInput('https://youtube.com/watch?v=1'), null);
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
  assert.equal(
    matchesAllowedVideoDomain('m.youtube.com', 'youtube.com'),
    true
  );
  assert.equal(matchesAllowedVideoDomain('notyoutube.com', 'youtube.com'), false);
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

test('deriveVideoLibraryEntries accepts custom allowlist domains', () => {
  const [entry] = deriveVideoLibraryEntries(
    [makeSession('custom', 'https://media.club.example.com/videos/42')],
    ['club.example.com']
  );

  assert.equal(entry.status, 'allowed_unchecked');
  assert.equal(entry.hostname, 'media.club.example.com');
});
