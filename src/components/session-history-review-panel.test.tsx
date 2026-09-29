import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionHistoryReviewPanel } from './session-history-review-panel';
import type { HistoryReviewResult } from '@/lib/jev-history-review';
import type { JudoSession } from '@/lib/types';

const session: JudoSession = {
  id: 'session-1',
  date: '2026-09-20',
  category: 'Technical',
  effort: 3,
  techniques: ['Uchi mata'],
};

function renderPanel(entries: HistoryReviewResult[], canUseAi = true) {
  return renderToStaticMarkup(
    React.createElement(SessionHistoryReviewPanel, {
      canUseAi,
      entries,
      sessions: [session],
      recurringThemeSummary: {
        consideredSessions: 0,
        themes: [],
      },
      onEditSession: () => {},
    })
  );
}

test('shows the sign-in guidance when AI review is unavailable', () => {
  assert.match(renderPanel([], false), /Sign in to review session history/);
});

test('renders per-session review failures and an edit action', () => {
  const failedEntry: HistoryReviewResult = {
    sessionId: session.id,
    sessionDate: session.date,
    currentCategory: session.category,
    currentEffort: session.effort,
    error: true,
  };
  const markup = renderPanel([failedEntry]);
  const signedOutMarkup = renderPanel([failedEntry], false);

  assert.match(markup, /This session could not be reviewed/);
  assert.match(markup, /Edit session/);
  assert.match(signedOutMarkup, /Sign in to review session history/);
});

test('renders actionable suggestions and recurring theme counts', () => {
  const markup = renderToStaticMarkup(
    React.createElement(SessionHistoryReviewPanel, {
      canUseAi: true,
      entries: [
        {
          sessionId: session.id,
          sessionDate: session.date,
          currentCategory: session.category,
          currentEffort: session.effort,
          assessment: {
            suggestedCategory: 'Randori',
            categoryConfidence: 0.95,
            categoryFitProbability: 0.95,
            hasUsefulDetail: 0.9,
            hasReflection: 0.9,
            effortConflictProbability: 0.1,
            unsupportedTechniqueTags: ['Uchi mata'],
            trainingThemes: {
              kumi_kata: 0.9,
              ne_waza: 0.1,
              transitions: 0.1,
              competition_tactics: 0.1,
            },
          },
        },
      ],
      sessions: [session],
      recurringThemeSummary: {
        consideredSessions: 2,
        themes: [
          {
            theme: 'kumi_kata',
            matchingSessions: 2,
            consideredSessions: 2,
            recentSessionIds: ['session-1', 'session-2'],
          },
        ],
      },
      onEditSession: () => {},
    })
  );

  assert.match(markup, /Possible type mismatch/);
  assert.match(markup, /Uchi mata/);
  assert.match(markup, /Kumi-kata/);
  assert.match(markup, /2 of 2 sessions/);
});
