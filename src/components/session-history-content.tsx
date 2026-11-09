'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { VanillaEmptyState } from '@/components/vanilla-empty-state';
import { VanillaSegmentedControl } from '@/components/vanilla-segmented-control';
import { SessionHistoryDialogs as SessionHistoryDialogsView } from './session-history-dialogs';
import { SessionHistoryFilterBar } from './session-history-filter-bar';
import { SessionHistoryReviewPanel } from './session-history-review-panel';
import { VanillaSessionHistoryGroups } from './vanilla-session-history-groups';
import type { JudoSession } from '@/lib/types';
import type { SessionHistoryMonthGroup } from '@/vanilla/session-history-groups';
import type { SessionHistoryDensity } from '@/vanilla/session-history-filter-controller';

export type { SessionHistoryDensity } from '@/vanilla/session-history-filter-controller';

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
      <VanillaEmptyState
        title="No sessions yet"
        description="Log your first training session and it will appear here."
        illustration={{
          src: '/images/ressa/ressa-pose-2.webp',
          alt: 'Ressa encouraging you to log your first session',
          size: 'medium',
        }}
        action={onLogSession
          ? { label: 'Log your first session', onActivate: onLogSession }
          : undefined}
      />
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
