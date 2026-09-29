import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionHistoryRow } from './session-history-row';
import type { JudoSession } from '@/lib/types';

const session: JudoSession = {
  id: 'session-1',
  date: '2026-09-20',
  category: 'Technical',
  effort: 4,
  techniques: ['Uchi mata', 'Osoto gari', 'Kesa gatame', 'Newaza'],
  description: 'Grip movement and entries',
  notes: 'Good rounds',
  duration: 90,
  videoUrl: 'https://www.example.com/watch?v=1',
};

function renderRow(overrides: Partial<JudoSession> = {}) {
  return renderToStaticMarkup(
    React.createElement(SessionHistoryRow, {
      session: { ...session, ...overrides },
      onDelete: () => {},
      onEdit: () => {},
      onFilterTechnique: () => {},
      deletingSessionId: null,
      density: 'compact',
    })
  );
}

test('renders technique count, session notes, safe video link, and action label', () => {
  const markup = renderRow();

  assert.match(markup, /Uchi mata/);
  assert.match(markup, /Osoto gari/);
  assert.match(markup, /Kesa gatame/);
  assert.match(markup, /\+1 more/);
  assert.match(markup, /Grip movement and entries · Good rounds/);
  assert.match(markup, /href="https:\/\/www\.example\.com\/watch\?v=1"/);
  assert.match(markup, /\(example\.com\)/);
  assert.match(markup, /Actions for session from/);
});

test('does not render unsafe video links', () => {
  const markup = renderRow({ videoUrl: 'javascript:alert(1)' });

  assert.doesNotMatch(markup, /Watch relevant video/);
  assert.doesNotMatch(markup, /javascript:/);
});
