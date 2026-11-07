import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type {
  HistoryReviewResult,
  RecurringTrainingThemeSummary,
} from '../lib/jev-history-review';
import type { JudoSession } from '../lib/types';
import {
  mountSessionHistoryReviewPanel,
  sessionHistoryReviewPanelHtml,
  type SessionHistoryReviewPanelProps,
} from './session-history-review-panel';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const session: JudoSession = {
  id: 'session-review-1',
  date: '2026-09-20',
  category: 'Technical',
  effort: 3,
  techniques: ['Uchi mata'],
};

const emptySummary: RecurringTrainingThemeSummary = {
  consideredSessions: 0,
  themes: [],
};

function makeProps(
  entries: HistoryReviewResult[],
  overrides: Partial<SessionHistoryReviewPanelProps> = {}
): SessionHistoryReviewPanelProps {
  return {
    entries,
    sessions: [session],
    recurringThemeSummary: emptySummary,
    onEditSession: () => {},
    ...overrides,
  };
}

test('does not render a panel when no review results exist', () => {
  assert.equal(sessionHistoryReviewPanelHtml(makeProps([])), '');
});

test('renders failure and suggestion states with escaped review content', () => {
  const failed: HistoryReviewResult = {
    sessionId: session.id,
    sessionDate: session.date,
    currentCategory: session.category,
    currentEffort: session.effort,
    error: true,
  };
  const suggested: HistoryReviewResult = {
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
      unsupportedTechniqueTags: ['<script>unsafe</script>'],
    },
  };
  const summary: RecurringTrainingThemeSummary = {
    consideredSessions: 2,
    themes: [{
      theme: 'kumi_kata',
      matchingSessions: 2,
      consideredSessions: 2,
      recentSessionIds: ['session-review-1', 'session-review-2'],
    }],
  };
  const markup = sessionHistoryReviewPanelHtml(makeProps([failed, suggested], {
    recurringThemeSummary: summary,
  }));
  const dom = new JSDOM(markup);

  assert.match(markup, /This session could not be reviewed/);
  assert.match(markup, /Possible type mismatch/);
  assert.match(markup, /Kumi-kata/);
  assert.match(markup, /2 of 2 sessions/);
  assert.match(markup, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.equal(dom.window.document.querySelector('script'), null);
  assert.equal(dom.window.document.querySelectorAll('[data-ui-action="history-review-edit"]').length, 2);
  dom.window.close();
});

test('edit actions use current props, preserve focus on update, and clean up', () => {
  const entry: HistoryReviewResult = {
    sessionId: session.id,
    sessionDate: session.date,
    currentCategory: session.category,
    currentEffort: session.effort,
    error: true,
  };
  const calls: string[] = [];
  const initial = makeProps([entry], {
    onEditSession: (target) => calls.push(`initial:${target.id}`),
  });
  const dom = new JSDOM('<main></main>');
  const host = dom.window.document.querySelector('main')!;
  host.innerHTML = sessionHistoryReviewPanelHtml(initial);
  const controller = mountSessionHistoryReviewPanel(host, initial);
  const originalButton = host.querySelector(
    '[data-ui-action="history-review-edit"]'
  ) as HTMLButtonElement;
  originalButton.focus();

  const updated = makeProps([entry], {
    onEditSession: (target) => calls.push(`updated:${target.id}`),
  });
  controller.update(updated);
  const updatedButton = host.querySelector(
    '[data-ui-action="history-review-edit"]'
  ) as HTMLButtonElement;
  assert.notEqual(updatedButton, originalButton);
  assert.equal(dom.window.document.activeElement, updatedButton);
  updatedButton.click();
  assert.deepEqual(calls, ['updated:session-review-1']);

  controller.destroy();
  updatedButton.click();
  assert.deepEqual(calls, ['updated:session-review-1']);
  dom.window.close();
});
