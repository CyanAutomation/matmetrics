'use client';

import { Button } from '@/components/ui/button';
import { DataUseNotice } from '@/components/ui/data-use-notice';
import { getHistoryReviewFindings } from '@/lib/jev-history-review';
import {
  HISTORY_REVIEW_BATCH_SIZE,
  type HistoryReviewResult,
  type RecurringTrainingThemeSummary,
} from '@/lib/jev-history-review';
import type { SessionAssessment, TrainingTheme } from '@/lib/jev-client';
import { EFFORT_LABELS, type JudoSession } from '@/lib/types';
import { formatDateLabel, parseDateOnly } from '@/lib/utils';

const trainingThemeLabels: Record<TrainingTheme, string> = {
  kumi_kata: 'Kumi-kata',
  ne_waza: 'Ne-waza',
  transitions: 'Transitions',
  competition_tactics: 'Competition tactics',
};

interface SessionHistoryReviewPanelProps {
  canUseAi: boolean;
  entries: HistoryReviewResult[];
  sessions: JudoSession[];
  recurringThemeSummary: RecurringTrainingThemeSummary;
  onEditSession: (session: JudoSession) => void;
}

function RecurringTrainingThemes({
  summary,
}: {
  summary: RecurringTrainingThemeSummary;
}) {
  if (summary.consideredSessions === 0) return null;

  return (
    <section
      aria-label="Recurring training themes"
      className="rounded-lg border border-primary/20 bg-background p-3"
    >
      <h3 className="text-sm font-semibold">Recurring themes</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Based on up to the {HISTORY_REVIEW_BATCH_SIZE} most recent sessions
        reviewed with AI. Themes are shown after appearing in at least two
        sessions.
      </p>
      {summary.themes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {summary.themes.map((theme) => (
            <li
              key={theme.theme}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="font-medium">
                {trainingThemeLabels[theme.theme]}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {theme.matchingSessions} of {theme.consideredSessions} sessions
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No theme has appeared in at least two of the{' '}
          {summary.consideredSessions} reviewed
          {summary.consideredSessions === 1 ? ' session.' : ' sessions.'}
        </p>
      )}
    </section>
  );
}

function ReviewSuggestions({
  entry,
  assessment,
}: {
  entry: HistoryReviewResult;
  assessment: SessionAssessment;
}) {
  const findings = getHistoryReviewFindings(entry);
  const hasOtherSuggestion =
    findings.needsUsefulDetail ||
    findings.needsReflection ||
    findings.effortMismatch ||
    assessment.unsupportedTechniqueTags.length > 0;

  return (
    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
      {findings.categoryMismatch ? (
        <p>
          Possible type mismatch: the review suggests{' '}
          <strong>{findings.categoryMismatch}</strong> with{' '}
          {Math.round(assessment.categoryConfidence * 100)}% confidence. Review
          before changing the saved type.
        </p>
      ) : findings.categoryUnclear ? (
        <p>
          The review could not confidently match this description to an existing
          session type.
        </p>
      ) : null}
      {findings.needsUsefulDetail ? (
        <p>
          Consider adding one concrete, category-relevant detail; a short entry
          can still be useful.
        </p>
      ) : null}
      {findings.needsReflection ? (
        <p>Consider adding a short reflection.</p>
      ) : null}
      {findings.effortMismatch ? (
        <p>
          The text may conflict with the effort rating you chose. Review both if
          needed.
        </p>
      ) : null}
      {assessment.unsupportedTechniqueTags.length > 0 ? (
        <p>
          The review could not confirm these saved technique tags from the text:{' '}
          {assessment.unsupportedTechniqueTags.join(', ')}. Review them
          manually; they have not been removed.
        </p>
      ) : null}
      {!findings.categoryMismatch &&
      !findings.categoryUnclear &&
      !hasOtherSuggestion ? (
        <p>No review suggestions met the current thresholds.</p>
      ) : null}
    </div>
  );
}

function HistoryReviewEntry({
  entry,
  session,
  onEditSession,
}: {
  entry: HistoryReviewResult;
  session?: JudoSession;
  onEditSession: (session: JudoSession) => void;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {formatDateLabel(parseDateOnly(entry.sessionDate), 'weekday-month-day-year')}{' '}
          · {entry.currentCategory} · {EFFORT_LABELS[entry.currentEffort]} effort
        </p>
      </div>
      {entry.error ? (
        <p className="mt-2 text-sm text-muted-foreground">
          This session could not be reviewed. You can try again in a later batch.
        </p>
      ) : entry.assessment ? (
        <ReviewSuggestions entry={entry} assessment={entry.assessment} />
      ) : null}
      {session ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 h-8 px-2"
          onClick={() => onEditSession(session)}
        >
          Edit session
        </Button>
      ) : null}
    </div>
  );
}

export function SessionHistoryReviewPanel({
  canUseAi,
  entries,
  sessions,
  recurringThemeSummary,
  onEditSession,
}: SessionHistoryReviewPanelProps) {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));

  return (
    <section
      aria-label="Optional training review"
      className="mb-4 rounded-lg bg-primary/5 px-3 py-2"
    >
      <DataUseNotice variant="history" />
      {!canUseAi ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Sign in to review session history.
        </p>
      ) : null}
      {entries.length > 0 ? (
        <div className="mt-3 space-y-3">
          <RecurringTrainingThemes summary={recurringThemeSummary} />
          {entries.map((entry) => (
            <HistoryReviewEntry
              key={entry.sessionId}
              entry={entry}
              session={sessionsById.get(entry.sessionId)}
              onEditSession={onEditSession}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
