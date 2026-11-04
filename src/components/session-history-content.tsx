'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { RessaImage } from '@/components/ressa-image';
import { VanillaSegmentedControl } from '@/components/vanilla-segmented-control';
import { SessionHistoryDialogs as SessionHistoryDialogsView } from './session-history-dialogs';
import { SessionHistoryFilterBar } from './session-history-filter-bar';
import { SessionHistoryReviewPanel } from './session-history-review-panel';
import { VanillaSessionHistoryGroups } from './vanilla-session-history-groups';
import type { JudoSession } from '@/lib/types';
import type { SessionHistoryMonthGroup } from '@/vanilla/session-history-groups';

export type SessionHistoryDensity = 'comfortable' | 'compact';

type FilterBarProps = ComponentProps<typeof SessionHistoryFilterBar>;
type ReviewPanelProps = ComponentProps<typeof SessionHistoryReviewPanel>;
type DialogProps = ComponentProps<typeof SessionHistoryDialogsView>;

interface SessionHistoryContentProps {
  grouped: SessionHistoryMonthGroup[];
  filteredSessions: JudoSession[];
  deletingSessionId: string | null;
  density: SessionHistoryDensity;
  onDensityChange: (density: SessionHistoryDensity) => void;
  semanticSearchActive: boolean;
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
  density,
  onDensityChange,
}: Pick<SessionHistoryContentProps, 'density' | 'onDensityChange'>) {
  return (
    <div className="flex items-center gap-2">
      <VanillaSegmentedControl
        label="History display density"
        value={density}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'comfortable', label: 'Comfortable' },
        ]}
        onChange={(value) => onDensityChange(value as SessionHistoryDensity)}
      />
    </div>
  );
}

export function SessionHistoryContent({
  grouped,
  filteredSessions,
  deletingSessionId,
  density,
  onDensityChange,
  semanticSearchActive,
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
          density={density}
          onDensityChange={onDensityChange}
        />
      }
      className="reveal-fade-up"
    >
      <SessionHistoryFilterBar {...filterBarProps} />
      <SessionHistoryReviewPanel {...reviewPanelProps} />
      <VanillaSessionHistoryGroups
        grouped={grouped}
        filteredSessions={filteredSessions}
        semanticSearchActive={semanticSearchActive}
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
