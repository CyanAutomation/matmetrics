import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionHistoryEmptyState } from './session-history-content';

test('empty history explains how to begin and offers both logging actions', () => {
  const markup = renderToStaticMarkup(
    React.createElement(SessionHistoryEmptyState, { onLogSession: () => {} })
  );

  assert.match(markup, /No sessions yet/);
  assert.match(markup, /Log your first training session/);
  assert.equal((markup.match(/>Log session</g) ?? []).length, 1);
  assert.equal((markup.match(/>Log your first session</g) ?? []).length, 1);
});

test('empty history stays informative without a logging callback', () => {
  const markup = renderToStaticMarkup(
    React.createElement(SessionHistoryEmptyState, {})
  );

  assert.match(markup, /No sessions yet/);
  assert.doesNotMatch(markup, />Log session</);
  assert.doesNotMatch(markup, />Log your first session</);
});
