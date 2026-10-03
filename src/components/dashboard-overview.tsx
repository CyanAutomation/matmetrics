'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  JudoSession,
  SessionCategory,
  TrainingPlanPreferences,
} from '@/lib/types';
import { Dumbbell, Flame, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { RessaImage } from '@/components/ressa-image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  resolveDashboardCategoryBarClass,
  resolveDashboardTechniqueBarClass,
  resolveSessionCategoryPresentation,
} from '@/lib/ui-semantic';
import { cn } from '@/lib/utils';
import {
  calculateDashboardOverviewStats,
  type DashboardDistributionWindow,
} from '@/lib/dashboard-overview-stats';
import { saveTrainingPlanPreference } from '@/lib/user-preferences';
import { DataSurface } from '@/components/ui/data-display';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MetricBarList } from '@/components/ui/metric-bar-list';

interface DashboardOverviewProps {
  sessions: JudoSession[];
  onLogSession?: () => void;
  isRefreshing?: boolean;
}

type RecentEffort = {
  date: string;
  timestamp: string;
  effort: number;
};

function EffortTrend({
  entries,
  average,
}: {
  entries: RecentEffort[];
  average: number | null;
}) {
  const chartWidth = 320;
  const chartHeight = 240;
  const chartLeft = 28;
  const chartRight = 308;
  const chartTop = 18;
  const chartBottom = 184;
  const points = entries.map((entry, index) => {
    const x =
      entries.length === 1
        ? (chartLeft + chartRight) / 2
        : chartLeft + ((chartRight - chartLeft) * index) / (entries.length - 1);
    const y = chartTop + ((5 - entry.effort) * (chartBottom - chartTop)) / 4;
    return { ...entry, x, y };
  });
  const line = points.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <div className="mt-5" aria-label="Recent effort trend">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-label-md text-muted-foreground">
          Effort trend
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {average === null
            ? 'No sessions in the last 14 days'
            : `Average ${average.toFixed(1)} / 5`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full overflow-visible"
        role="img"
        aria-label="Reported effort for recent sessions, on a scale from 1 to 5"
      >
        {[5, 4, 3, 2, 1].map((value) => {
          const y = chartTop + ((5 - value) * (chartBottom - chartTop)) / 4;
          return (
            <g key={value}>
              <line
                x1={chartLeft}
                x2={chartRight}
                y1={y}
                y2={y}
                stroke="hsl(var(--color-outline-variant) / 0.35)"
                strokeWidth="1"
              />
              <text
                x="0"
                y={y + 3}
                fill="hsl(var(--color-on-surface-variant))"
                fontSize="10"
              >
                {value}
              </text>
            </g>
          );
        })}
        {points.length > 1 && (
          <polyline
            fill="none"
            points={line}
            stroke="hsl(var(--color-primary))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((point) => (
          <g key={`${point.timestamp}-${point.effort}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="hsl(var(--color-primary))"
              stroke="hsl(var(--color-surface-container-low))"
              strokeWidth="2"
            />
            <title>{`${point.date}: effort ${point.effort} of 5`}</title>
          </g>
        ))}
        <text
          x={chartLeft}
          y="208"
          fill="hsl(var(--color-on-surface-variant))"
          fontSize="10"
        >
          {entries[0]?.date}
        </text>
        <text
          x={chartRight}
          y="208"
          fill="hsl(var(--color-on-surface-variant))"
          fontSize="10"
          textAnchor="end"
        >
          {entries.at(-1)?.date}
        </text>
      </svg>
      <ol className="sr-only">
        {entries.map((entry) => (
          <li key={`${entry.timestamp}-${entry.effort}`}>
            {entry.date}: effort {entry.effort} of 5
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DashboardOverview({
  sessions,
  onLogSession,
  isRefreshing = false,
}: DashboardOverviewProps) {
  const { canSavePreferences, preferences, user } = useAuth();
  const enabledCategories = preferences.sessionTypes.enabledCategories;
  const [distributionWindow, setDistributionWindow] =
    useState<DashboardDistributionWindow>(
    30
    );
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isPlanDetailsOpen, setIsPlanDetailsOpen] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<TrainingPlanPreferences>(
    preferences.trainingPlan
  );

  useEffect(() => {
    setPlanDraft(preferences.trainingPlan);
  }, [preferences.trainingPlan]);

  const updatePlanDraft = (category: SessionCategory, value: number) => {
    setPlanDraft((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category]: {
          ...current.categories[category],
          targetSessions: Math.max(
            0,
            Math.min(31, Number.isFinite(value) ? value : 0)
          ),
        },
      },
    }));
  };

  const updatePlanCadence = (
    category: SessionCategory,
    cadence: 'week' | 'month'
  ) => {
    setPlanDraft((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category]: {
          ...current.categories[category],
          cadence,
        },
      },
    }));
  };

  const savePlan = async () => {
    if (!user || !canSavePreferences) {
      setPlanError('Sign in to save a personal training plan.');
      return;
    }

    setIsSavingPlan(true);
    setPlanError(null);
    try {
      await saveTrainingPlanPreference(user.uid, planDraft);
      setIsPlanDialogOpen(false);
    } catch {
      setPlanError('Your plan could not be saved. Please try again.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const stats = useMemo(
    () =>
      calculateDashboardOverviewStats({
        sessions,
        enabledCategories,
        trainingPlan: preferences.trainingPlan,
        distributionWindow,
      }),
    [distributionWindow, enabledCategories, preferences.trainingPlan, sessions]
  );

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl bg-muted/45">
        <RessaImage
          pose={5}
          size="medium"
          alt="Ressa looking forward to your training data"
        />
        <h3 className="text-xl font-semibold mb-2 mt-4">No session data yet</h3>
        <p className="text-muted-foreground mb-6">
          Log your first training session to start seeing your progress here.
        </p>
        {onLogSession && (
          <Button onClick={onLogSession}>Log your first session</Button>
        )}
      </div>
    );
  }

  return (
    <div className="reveal-fade-up mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-label-md text-primary">Your training</p>
          <h2 className="text-display-sm mt-1">Build a sustainable rhythm.</h2>
          <p className="text-sm text-muted-foreground">
            {isRefreshing
              ? 'Updating your training data…'
              : `Last session ${stats.latestSessionLabel} · ${stats.completedRollingTarget} of ${stats.effectiveRollingTarget} planned sessions in the last 30 days`}
          </p>
        </div>
      </div>
      <DataSurface className="mb-6 overflow-hidden bg-[hsl(var(--color-surface-container-low))] p-0 shadow-none">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-label-md text-primary">
              {stats.coachingInsight.eyebrow}
            </p>
            <h3 className="mt-1 text-headline-lg">
              {stats.coachingInsight.title}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {stats.coachingInsight.detail}
            </p>
          </div>
        </div>
        <div className="grid gap-4 border-t border-[hsl(var(--color-outline-variant)/0.16)] px-5 pt-4 sm:grid-cols-2 sm:px-6 sm:pt-5">
          <div className="flex items-center gap-3">
            <Flame className="h-4 w-4 text-primary" />
            <div>
              <p className="text-label-md text-muted-foreground">
                Recent rhythm
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {stats.sessionsInLastFortnight} sessions in 14 days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:border-l sm:border-[hsl(var(--color-outline-variant)/0.16)] sm:pl-6">
            <Target className="h-4 w-4 text-primary" />
            <div>
              <p className="text-label-md text-muted-foreground">Next focus</p>
              <p className="mt-1 font-semibold">{stats.nextFocus}</p>
            </div>
          </div>
        </div>
      </DataSurface>

      <DataSurface className="mb-8 bg-[hsl(var(--color-surface-container-low))] shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-label-md text-primary">Your plan</p>
            <p className="mt-1 text-headline-sm">
              <span className="tabular-nums">
                {stats.completedRollingTarget} of {stats.effectiveRollingTarget}
              </span>{' '}
              sessions complete
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={isPlanDetailsOpen}
              onClick={() => setIsPlanDetailsOpen((open) => !open)}
            >
              {isPlanDetailsOpen ? 'Hide details' : 'View plan'}
              {isPlanDetailsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlanError(null);
                setPlanDraft(preferences.trainingPlan);
                setIsPlanDialogOpen(true);
              }}
            >
              Edit plan
            </Button>
          </div>
        </div>
        {isPlanDetailsOpen && (
          <div className="mt-3 space-y-2">
            {stats.rollingPlan.map((item) => (
              <div
                key={item.category}
                className="border-t border-[hsl(var(--color-outline-variant)/0.16)] py-3 first:border-t-0 first:pt-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 font-semibold">
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        resolveSessionCategoryPresentation(item.category)
                          .dotClass
                      )}
                      aria-hidden="true"
                    />
                    {item.category}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {item.completed} / {item.effectiveTarget}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      resolveDashboardCategoryBarClass(item.category)
                    )}
                    style={{
                      width: `${Math.min(100, (item.completed / Math.max(item.effectiveTarget, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.isComplete
                    ? 'Complete for this 30-day window'
                    : `${item.remaining} ${item.remaining === 1 ? 'session' : 'sessions'} remaining`}{' '}
                  · Target: per {item.cadence}
                </p>
              </div>
            ))}
            <p className="px-1 text-xs text-muted-foreground">
              Weekly targets are shown as a 30-day equivalent.
            </p>
          </div>
        )}
      </DataSurface>

      <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set a realistic training plan</DialogTitle>
            <DialogDescription>
              Choose the sessions you intend to attend, at the cadence that
              makes sense for your training.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {enabledCategories.map((category) => {
              const plan = planDraft.categories[category];
              return (
                <div
                  key={category}
                  className="rounded-xl border border-border bg-secondary/20 p-4"
                >
                  <h4 className="font-semibold">{category}</h4>
                  <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-2">
                      <Label htmlFor={`${category}-target`}>
                        I intend to attend
                      </Label>
                      <Input
                        id={`${category}-target`}
                        min="0"
                        max="31"
                        type="number"
                        value={plan.targetSessions}
                        onChange={(event) =>
                          updatePlanDraft(category, Number(event.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cadence</Label>
                      <SegmentedControl
                        aria-label={`${category} plan cadence`}
                        value={plan.cadence}
                        onValueChange={(value) =>
                          updatePlanCadence(category, value as 'week' | 'month')
                        }
                      >
                        {(['week', 'month'] as const).map((cadence) => (
                          <SegmentedControl.Item
                            key={cadence}
                            value={cadence}
                            className="px-3 py-2 text-sm"
                          >
                            Per {cadence}
                          </SegmentedControl.Item>
                        ))}
                      </SegmentedControl>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {planError && <p className="text-sm text-destructive">{planError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPlanDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={savePlan} disabled={isSavingPlan}>
              {isSavingPlan ? 'Saving…' : 'Save plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 items-start gap-8 @min-[64rem]/main:grid-cols-2">
        <DataSurface className="bg-[hsl(var(--color-surface-container-low))]">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-headline-sm">Training load</h3>
            <Dumbbell className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold">{stats.effortInsight.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.effortInsight.detail}
          </p>
          <EffortTrend
            entries={stats.recentEfforts}
            average={stats.recentEffortAverage}
          />
        </DataSurface>

        {/* Training Distribution — surface, not card */}
        <DataSurface className="@container/distribution bg-[hsl(var(--color-surface-container-low))]">
          <div className="mb-6 flex flex-col gap-3 @min-[32rem]/distribution:flex-row @min-[32rem]/distribution:items-center @min-[32rem]/distribution:justify-between">
            <div>
              <h3 className="text-headline-sm">Training Distribution</h3>
              <span className="text-xs text-muted-foreground">
                {stats.trainingDataRange}
              </span>
            </div>
            <SegmentedControl
              className="flex w-full flex-wrap @min-[32rem]/distribution:w-fit"
              aria-label="Training distribution timeframe"
              value={String(distributionWindow)}
              onValueChange={(value) =>
                setDistributionWindow(
                  value === 'all' ? 'all' : (Number(value) as 30 | 90)
                )
              }
            >
              {([30, 90, 'all'] as const).map((window) => (
                <SegmentedControl.Item
                  key={window}
                  value={String(window)}
                  className="min-w-fit flex-1 whitespace-nowrap"
                >
                  {window === 'all' ? 'All time' : `${window} days`}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          </div>
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-label-md text-muted-foreground">
                Session Types
              </p>
              <MetricBarList
                ariaLabel="Session type distribution"
                items={stats.categoryStats.map((cat) => ({
                  label: cat.name,
                  value: cat.count,
                  barClassName: cn(
                    'transition-all duration-500',
                    resolveDashboardCategoryBarClass(cat.name)
                  ),
                }))}
              />
            </div>

            <div className="space-y-4">
              <p className="text-label-md text-muted-foreground">
                Top Techniques
              </p>
              <MetricBarList
                ariaLabel="Top techniques"
                items={stats.topTechniques.map((tech, idx) => ({
                  label: tech.name,
                  value: tech.count,
                  valueLabel: `${tech.count}x`,
                  barClassName: resolveDashboardTechniqueBarClass(idx),
                }))}
              />
            </div>
          </div>
        </DataSurface>
      </div>
    </div>
  );
}
