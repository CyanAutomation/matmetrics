import {
  getHistoryReviewFindings,
  type HistoryReviewResult,
  type RecurringTrainingThemeSummary,
} from '../lib/jev-history-review';
import type { SessionAssessment, TrainingTheme } from '../lib/jev-client';
import { EFFORT_LABELS, type JudoSession } from '../lib/types';
import { formatDateLabel, parseDateOnly } from '../lib/utils';
import { buttonHtml } from './button';
import { escapeHtml, type ComponentController } from './component';
import { surfaceClassName } from './surface';

export interface SessionHistoryReviewPanelProps {
  entries: HistoryReviewResult[];
  sessions: JudoSession[];
  recurringThemeSummary: RecurringTrainingThemeSummary;
  onEditSession: (session: JudoSession) => void;
}

const trainingThemeLabels: Record<TrainingTheme, string> = {
  kumi_kata: 'Kumi-kata',
  ne_waza: 'Ne-waza',
  transitions: 'Transitions',
  competition_tactics: 'Competition tactics',
};

function recurringThemesHtml(summary: RecurringTrainingThemeSummary): string {
  if (summary.consideredSessions === 0) return '';
  const themes = summary.themes.length > 0
    ? `<ul class="ui-session-history-review__themes-list">${summary.themes.map((theme) => `<li><span class="ui-session-history-review__theme-name">${escapeHtml(trainingThemeLabels[theme.theme])}</span><span class="ui-session-history-review__theme-count">${theme.matchingSessions} of ${theme.consideredSessions} sessions</span></li>`).join('')}</ul>`
    : `<p class="ui-session-history-review__empty-themes">No theme has appeared in at least two of the ${summary.consideredSessions} reviewed ${summary.consideredSessions === 1 ? 'session.' : 'sessions.'}</p>`;

  return `<section class="${surfaceClassName({ variant: 'default', padding: 'sm' })} ui-session-history-review__themes" aria-label="Recurring training themes">
    <h3>Recurring themes</h3>
    <p class="ui-session-history-review__theme-description">Based on all successfully reviewed sessions. Themes are shown after appearing in at least two sessions.</p>
    ${themes}
  </section>`;
}

function suggestionsHtml(
  entry: HistoryReviewResult,
  assessment: SessionAssessment
): string {
  const findings = getHistoryReviewFindings(entry);
  const suggestions: string[] = [];

  if (findings.categoryMismatch) {
    suggestions.push(`<p>Possible type mismatch: the review suggests <strong>${escapeHtml(findings.categoryMismatch)}</strong> with ${Math.round(assessment.categoryConfidence * 100)}% confidence. Review before changing the saved type.</p>`);
  } else if (findings.categoryUnclear) {
    suggestions.push('<p>The review could not confidently match this description to an existing session type.</p>');
  }
  if (findings.needsUsefulDetail) {
    suggestions.push('<p>Consider adding one concrete, category-relevant detail; a short entry can still be useful.</p>');
  }
  if (findings.needsReflection) suggestions.push('<p>Consider adding a short reflection.</p>');
  if (findings.effortMismatch) {
    suggestions.push('<p>The text may conflict with the effort rating you chose. Review both if needed.</p>');
  }
  if (assessment.unsupportedTechniqueTags.length > 0) {
    suggestions.push(`<p>The review could not confirm these saved technique tags from the text: ${assessment.unsupportedTechniqueTags.map(escapeHtml).join(', ')}. Review them manually; they have not been removed.</p>`);
  }
  if (suggestions.length === 0) {
    suggestions.push('<p>No review suggestions met the current thresholds.</p>');
  }

  return `<div class="ui-session-history-review__suggestions">${suggestions.join('')}</div>`;
}

function reviewEntryHtml(
  entry: HistoryReviewResult,
  session: JudoSession | undefined
): string {
  const date = escapeHtml(
    formatDateLabel(parseDateOnly(entry.sessionDate), 'weekday-month-day-year')
  );
  const category = escapeHtml(entry.currentCategory);
  const effort = escapeHtml(EFFORT_LABELS[entry.currentEffort]);
  const result = entry.error
    ? '<p class="ui-session-history-review__failure">This session could not be reviewed. You can try again in a later batch.</p>'
    : entry.assessment
      ? suggestionsHtml(entry, entry.assessment)
      : '';
  const editButton = session
    ? buttonHtml({
        label: 'Edit session',
        variant: 'ghost',
        dataAction: 'history-review-edit',
        onClick: () => {},
      }, 'ui-session-history-review__edit')
        .replace('<button ', `<button data-session-id="${escapeHtml(session.id)}" `)
    : '';

  return `<article class="ui-session-history-review__entry" data-ui-session-history-entry data-session-id="${escapeHtml(entry.sessionId)}">
    <div class="ui-session-history-review__entry-heading"><p>${date} · ${category} · ${effort} effort</p></div>
    ${result}
    ${editButton}
  </article>`;
}

export function sessionHistoryReviewPanelHtml(
  props: SessionHistoryReviewPanelProps
): string {
  if (props.entries.length === 0) return '';
  const sessionsById = new Map(props.sessions.map((session) => [session.id, session]));
  const entries = props.entries
    .map((entry) => reviewEntryHtml(entry, sessionsById.get(entry.sessionId)))
    .join('');

  return `<section class="ui-session-history-review" aria-label="Training review results" data-ui-session-history-review>
    <div class="ui-session-history-review__content">
      ${recurringThemesHtml(props.recurringThemeSummary)}
      ${entries}
    </div>
  </section>`;
}

export function mountSessionHistoryReviewPanel(
  root: HTMLElement,
  initialProps: SessionHistoryReviewPanelProps
): ComponentController<SessionHistoryReviewPanelProps> {
  let current = initialProps;

  const render = (props: SessionHistoryReviewPanelProps) => {
    const activeElement = root.ownerDocument.activeElement;
    const activeWindow = root.ownerDocument.defaultView;
    const focusedSessionId = activeWindow &&
      activeElement instanceof activeWindow.HTMLElement &&
      root.contains(activeElement) &&
      activeElement.matches('[data-ui-action="history-review-edit"]')
        ? activeElement.dataset.sessionId
        : undefined;

    root.innerHTML = sessionHistoryReviewPanelHtml(props);
    if (focusedSessionId) {
      const replacement = Array.from(root.querySelectorAll<HTMLButtonElement>(
        '[data-ui-action="history-review-edit"]'
      )).find((button) => button.dataset.sessionId === focusedSessionId);
      replacement?.focus();
    }
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    const activeWindow = root.ownerDocument.defaultView;
    if (!activeWindow || !(target instanceof activeWindow.Element)) return;
    const button = target.closest<HTMLButtonElement>(
      '[data-ui-action="history-review-edit"]'
    );
    if (!button) return;
    const session = current.sessions.find(
      (candidate) => candidate.id === button.dataset.sessionId
    );
    if (session) current.onEditSession(session);
  };

  render(initialProps);
  root.addEventListener('click', onClick);
  return {
    update(next) {
      current = next;
      render(next);
    },
    destroy() {
      root.removeEventListener('click', onClick);
    },
  };
}
