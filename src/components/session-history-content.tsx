'use client';

import type { ComponentProps } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataSurface } from '@/components/ui/data-display';
import { PageShell } from '@/components/ui/page-shell';
import { RessaImage } from '@/components/ressa-image';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SessionHistoryDialogs as SessionHistoryDialogsView } from './session-history-dialogs';
import { SessionHistoryFilterBar } from './session-history-filter-bar';
import { SessionHistoryReviewPanel } from './session-history-review-panel';
import { SessionHistoryRow } from './session-history-row';
import type { JudoSession } from '@/lib/types';

export type SessionHistoryDensity = 'comfortable' | 'compact';

type GroupedSessions = Array<{
  monthLabel: string;
  sessions: JudoSession[];
}>;

type FilterBarProps = ComponentProps<typeof SessionHistoryFilterBar>;
type ReviewPanelProps = ComponentProps<typeof SessionHistoryReviewPanel>;
type DialogProps = ComponentProps<typeof SessionHistoryDialogsView>;

interface SessionHistoryContentProps {
  grouped: GroupedSessions;
  filteredSessions: JudoSession[];
  deletingSessionId: string | null;
  density: SessionHistoryDensity;
  onDensityChange: (density: SessionHistoryDensity) => void;
  onReviewHistory: () => Promise<void>;
  hasUnreviewedDescriptions: boolean;
  isReviewingHistory: boolean;
  reviewProgress: { completed: number; total: number };
  onRequestDelete: (session: JudoSession) => void;
  onEditSession: (session: JudoSession) => void;
  onFilterTechnique: (technique: string) => void;
  filterBarProps: FilterBarProps;
  reviewPanelProps: ReviewPanelProps;
  dialogProps: DialogProps;
}

export function SessionHistoryEmptyState({
  onLogSession,
}: {
  onLogSession?: () => void;
}) {
  return (
    <PageShell
      title="Training history"
      description="Search and revisit your training sessions."
      actions={
        onLogSession ? (
          <Button onClick={onLogSession}>Log session</Button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl bg-muted/45">
        <RessaImage
          pose={2}
          size="medium"
          alt="Ressa encouraging you to log your first session"
        />
        <p className="text-center font-semibold mt-4 mb-1">No sessions yet</p>
        <p className="text-center text-sm text-muted-foreground mb-6">
          Log your first training session and it will appear here.
        </p>
        {onLogSession ? (
          <Button onClick={onLogSession}>Log your first session</Button>
        ) : null}
      </div>
    </PageShell>
  );
}

function SessionHistoryHeaderActions({
  onReviewHistory,
  hasUnreviewedDescriptions,
  isReviewingHistory,
  reviewProgress,
  density,
  onDensityChange,
  canUseAi,
}: Pick<
  SessionHistoryContentProps,
  | 'onReviewHistory'
  | 'hasUnreviewedDescriptions'
  | 'isReviewingHistory'
  | 'reviewProgress'
  | 'density'
  | 'onDensityChange'
> & { canUseAi: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => void onReviewHistory()}
        disabled={!canUseAi || isReviewingHistory || !hasUnreviewedDescriptions}
      >
        {isReviewingHistory ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isReviewingHistory
          ? `Reviewing ${reviewProgress.completed} of ${reviewProgress.total}`
          : hasUnreviewedDescriptions
            ? 'Review up to 5 sessions'
            : 'This view is reviewed'}
      </Button>
      <SegmentedControl
        aria-label="History display density"
        value={density}
        onValueChange={(value) =>
          onDensityChange(value as SessionHistoryDensity)
        }
      >
        <SegmentedControl.Item value="compact">Compact</SegmentedControl.Item>
        <SegmentedControl.Item value="comfortable">
          Comfortable
        </SegmentedControl.Item>
      </SegmentedControl>
    </div>
  );
}

function SessionHistorySessionGroups({
  grouped,
  filteredSessions,
  deletingSessionId,
  density,
  onRequestDelete,
  onEditSession,
  onFilterTechnique,
}: Pick<
  SessionHistoryContentProps,
  | 'grouped'
  | 'filteredSessions'
  | 'deletingSessionId'
  | 'density'
  | 'onRequestDelete'
  | 'onEditSession'
  | 'onFilterTechnique'
>) {
  return (
    <>
      {filteredSessions.length === 0 ? (
        <div className="rounded-xl bg-muted/45 p-8 text-center">
          <p className="font-semibold">No sessions match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different technique, date range, or effort level.
          </p>
        </div>
      ) : null}
      {grouped.map(({ monthLabel, sessions }) => (
        <div key={monthLabel} className="mb-8 last:mb-0">
          <h3 className="text-headline-sm mb-4">{monthLabel}</h3>
          <DataSurface className="space-y-3" padding="sm" variant="subtle">
            {sessions.map((session) => (
              <div key={session.id}>
                <SessionHistoryRow
                  session={session}
                  onDelete={() => onRequestDelete(session)}
                  onEdit={onEditSession}
                  onFilterTechnique={onFilterTechnique}
                  deletingSessionId={deletingSessionId}
                  density={density}
                />
              </div>
            ))}
          </DataSurface>
        </div>
      ))}
    </>
  );
}

export function SessionHistoryContent({
  grouped,
  filteredSessions,
  deletingSessionId,
  density,
  onDensityChange,
  onReviewHistory,
  hasUnreviewedDescriptions,
  isReviewingHistory,
  reviewProgress,
  onRequestDelete,
  onEditSession,
  onFilterTechnique,
  filterBarProps,
  reviewPanelProps,
  dialogProps,
}: SessionHistoryContentProps) {
  return (
    <PageShell
      title="Training history"
      description="Search, filter, and revisit your training sessions."
      actions={
        <SessionHistoryHeaderActions
          onReviewHistory={onReviewHistory}
          canUseAi={reviewPanelProps.canUseAi}
          hasUnreviewedDescriptions={hasUnreviewedDescriptions}
          isReviewingHistory={isReviewingHistory}
          reviewProgress={reviewProgress}
          density={density}
          onDensityChange={onDensityChange}
        />
      }
      className="reveal-fade-up"
    >
      <SessionHistoryFilterBar {...filterBarProps} />
      <SessionHistoryReviewPanel {...reviewPanelProps} />
      <SessionHistorySessionGroups
        grouped={grouped}
        filteredSessions={filteredSessions}
        deletingSessionId={deletingSessionId}
        density={density}
        onRequestDelete={onRequestDelete}
        onEditSession={onEditSession}
        onFilterTechnique={onFilterTechnique}
      />
      <SessionHistoryDialogsView {...dialogProps} />
    </PageShell>
  );
}
