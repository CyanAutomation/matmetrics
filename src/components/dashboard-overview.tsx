'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict, subDays } from 'date-fns';
import {
  JudoSession,
  SessionCategory,
  TrainingPlanPreferences,
} from '@/lib/types';
import {
  Dumbbell,
  Flame,
  ArrowRight,
  Target,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
import { cn, parseDateOnly } from '@/lib/utils';
import { saveTrainingPlanPreference } from '@/lib/user-preferences';
import { DataSurface } from '@/components/ui/data-display';

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
    <div
      className="mt-5 flex min-h-[250px] flex-1 flex-col"
      aria-label="Recent effort trend"
    >
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
        preserveAspectRatio="none"
        className="min-h-[220px] w-full flex-1 overflow-visible"
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
          y="224"
          fill="hsl(var(--color-on-surface-variant))"
          fontSize="10"
        >
          {entries[0]?.date}
        </text>
        <text
          x={chartRight}
          y="224"
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
  const [distributionWindow, setDistributionWindow] = useState<30 | 90 | 'all'>(
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

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;

    const sortedSessions = [...sessions].sort(
      (left, right) =>
        parseDateOnly(right.date).getTime() - parseDateOnly(left.date).getTime()
    );

    const avgEffort =
      sessions.reduce((acc, s) => acc + s.effort, 0) / sessions.length;

    const now = new Date();
    const distributionStart =
      distributionWindow === 'all'
        ? null
        : subDays(now, distributionWindow - 1);
    const distributionSessions = distributionStart
      ? sortedSessions.filter(
          (session) => parseDateOnly(session.date) >= distributionStart
        )
      : sortedSessions;
    const techniqueCount: Record<string, number> = {};
    const categoryCount: Record<string, number> = Object.fromEntries(
      enabledCategories.map((category) => [category, 0])
    );

    distributionSessions.forEach((s) => {
      const techniques = Array.isArray(s.techniques) ? s.techniques : [];
      techniques.forEach((t) => {
        techniqueCount[t] = (techniqueCount[t] || 0) + 1;
      });
      if (enabledCategories.includes(s.category)) {
        categoryCount[s.category] += 1;
      }
    });

    const topTechniques = Object.entries(techniqueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const categoryStats = Object.entries(categoryCount).map(
      ([name, count]) => ({ name, count })
    );

    const maxCategoryCount = Math.max(
      ...categoryStats.map((category) => category.count),
      1
    );
    const maxTechniqueCount = Math.max(
      ...topTechniques.map((technique) => technique.count),
      1
    );

    const recentEfforts = sortedSessions
      .slice(0, 7)
      .reverse()
      .map((s) => ({
        date: parseDateOnly(s.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        timestamp: s.date,
        effort: s.effort,
      }));

    const topCategory =
      Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      'Technical';
    const sessionDates = sortedSessions
      .map((session) => parseDateOnly(session.date))
      .sort((a, b) => a.getTime() - b.getTime());
    const firstSessionDate = sessionDates[0];
    const latestSessionDate = sessionDates[sessionDates.length - 1];
    const daysSinceLatestSession = Math.max(
      0,
      Math.floor(
        (Date.now() - latestSessionDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    const rollingStart = subDays(now, 29);
    const sessionsInRollingWindowByCategory: Record<SessionCategory, number> =
      Object.fromEntries(
        (['Technical', 'Randori', 'Shiai', 'Cardio', 'S&C'] as const).map(
          (category) => [category, 0]
        )
      ) as Record<SessionCategory, number>;
    sortedSessions.forEach((session) => {
      if (parseDateOnly(session.date) >= rollingStart) {
        sessionsInRollingWindowByCategory[session.category] += 1;
      }
    });
    const lastFortnight = subDays(now, 13);
    const sessionsInLastFortnight = sortedSessions.filter(
      (session) => parseDateOnly(session.date) >= lastFortnight
    ).length;

    const rollingPlan = enabledCategories.map((category) => {
      const plan = preferences.trainingPlan.categories[category];
      const effectiveTarget =
        plan.cadence === 'week'
          ? Math.round(plan.targetSessions * (30 / 7))
          : plan.targetSessions;
      const completed = sessionsInRollingWindowByCategory[category];
      const remaining = Math.max(0, effectiveTarget - completed);
      return {
        category,
        completed,
        cadence: plan.cadence,
        effectiveTarget,
        remaining,
        isComplete: completed >= effectiveTarget,
      };
    });
    const nextPlanItem = [...rollingPlan]
      .filter((item) => item.remaining > 0)
      .sort((left, right) => right.remaining - left.remaining)[0];
    const completedRollingTarget = rollingPlan.reduce(
      (total, item) => total + Math.min(item.completed, item.effectiveTarget),
      0
    );
    const effectiveRollingTarget = rollingPlan.reduce(
      (total, item) => total + item.effectiveTarget,
      0
    );
    const remainingPlanSessions = Math.max(
      0,
      effectiveRollingTarget - completedRollingTarget
    );
    const expectedFortnightSessions = effectiveRollingTarget / 2;
    const effortSessionsInLastFortnight = sortedSessions.filter(
      (session) => parseDateOnly(session.date) >= lastFortnight
    );
    const recentEffortAverage = effortSessionsInLastFortnight.length
      ? effortSessionsInLastFortnight.reduce(
          (total, session) => total + session.effort,
          0
        ) / effortSessionsInLastFortnight.length
      : null;
    const priorFortnight = subDays(now, 27);
    const earlierEffortSessions = sortedSessions.filter((session) => {
      const date = parseDateOnly(session.date);
      return date >= priorFortnight && date < lastFortnight;
    });
    const earlierEffortAverage = earlierEffortSessions.length
      ? earlierEffortSessions.reduce(
          (total, session) => total + session.effort,
          0
        ) / earlierEffortSessions.length
      : null;
    const effortInsight = (() => {
      if (effortSessionsInLastFortnight.length < 2) {
        return {
          title: 'Build the rhythm first',
          detail:
            'There are not enough recent sessions to judge your training load yet. Focus on the next planned session.',
        };
      }
      if (
        earlierEffortAverage !== null &&
        recentEffortAverage !== null &&
        recentEffortAverage >= earlierEffortAverage + 0.8
      ) {
        return {
          title: 'Recent effort is higher than usual',
          detail:
            'Your reported effort is noticeably above the previous two weeks. A lighter technical session may help keep the plan sustainable.',
        };
      }
      if (sessionsInLastFortnight < expectedFortnightSessions * 0.7) {
        return {
          title: 'Training is below your planned rhythm',
          detail:
            'Your recent session count is lower than your plan suggests. Add a focused session before increasing intensity.',
        };
      }
      return {
        title: 'Your recent effort looks sustainable',
        detail:
          'Your reported effort and session rhythm are broadly in line with your recent training pattern.',
      };
    })();
    const coachingInsight =
      remainingPlanSessions === 0
        ? {
            eyebrow: 'Plan complete',
            title: 'Your 30-day plan is on track.',
            detail:
              'Keep the rhythm steady, or adjust the plan if your availability has changed.',
          }
        : {
            eyebrow: 'Next best step',
            title: `${nextPlanItem?.category ?? 'A training'} session is the clearest next move.`,
            detail: `${remainingPlanSessions} planned ${remainingPlanSessions === 1 ? 'session remains' : 'sessions remain'} in this 30-day window. ${nextPlanItem?.remaining ?? 0} ${nextPlanItem?.category ?? ''} ${nextPlanItem?.remaining === 1 ? 'session is' : 'sessions are'} still to go.`,
          };

    return {
      totalSessions: sessions.length,
      avgEffort: avgEffort.toFixed(1),
      topTechniques,
      categoryStats,
      maxCategoryCount,
      maxTechniqueCount,
      topCategory,
      recentEfforts,
      rollingRangeLabel: `${format(rollingStart, 'd MMM')} – ${format(now, 'd MMM')}`,
      trainingDataRange:
        distributionWindow === 'all'
          ? `${firstSessionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${latestSessionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
          : `Last ${distributionWindow} days`,
      latestSessionLabel: formatDistanceToNowStrict(latestSessionDate, {
        addSuffix: true,
      }),
      needsTrainingNudge: daysSinceLatestSession >= 14,
      sessionsInLastFortnight,
      rollingPlan,
      completedRollingTarget,
      effectiveRollingTarget,
      nextFocus: nextPlanItem?.category ?? 'Consistency',
      remainingPlanSessions,
      coachingInsight,
      effortInsight,
      recentEffortAverage,
    };
  }, [
    distributionWindow,
    enabledCategories,
    preferences.trainingPlan,
    sessions,
  ]);

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
        <RessaImage
          pose={2}
          size="compact"
          alt=""
          animate={false}
          className="hidden w-24 shrink-0 self-center md:flex"
        />
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
          {onLogSession && (
            <Button className="min-h-11" onClick={onLogSession}>
              Log session <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-3 rounded-xl bg-card/55 px-4 py-3">
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
          <div className="flex items-center gap-3 rounded-xl bg-card/55 px-4 py-3">
            <Target className="h-4 w-4 text-primary" />
            <div>
              <p className="text-label-md text-muted-foreground">Next focus</p>
              <p className="mt-1 font-semibold">{stats.nextFocus}</p>
            </div>
          </div>
        </div>
      </DataSurface>

      <DataSurface className="mb-8 bg-[hsl(var(--color-surface-container-low))]">
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
          <div className="flex items-center gap-2">
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
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {stats.rollingPlan.map((item) => (
            <div
              key={item.category}
              className="rounded-xl bg-card/55 px-3 py-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full',
                    resolveSessionCategoryPresentation(item.category).dotClass
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {item.category}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {item.completed} / {item.effectiveTarget}
                </span>
              </div>
              <div
                className="mt-2 grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(item.effectiveTarget, 1)}, minmax(0, 1fr))`,
                }}
                role="img"
                aria-label={`${item.category}: ${item.completed} of ${item.effectiveTarget} planned sessions complete`}
              >
                {Array.from(
                  { length: Math.max(item.effectiveTarget, 1) },
                  (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-2 rounded-full bg-muted',
                        index < item.completed &&
                          resolveDashboardCategoryBarClass(item.category)
                      )}
                      aria-hidden="true"
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
        {isPlanDetailsOpen && (
          <div className="mt-3 space-y-2">
            {stats.rollingPlan.map((item) => (
              <div
                key={item.category}
                className="rounded-xl bg-card/55 px-4 py-3"
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
                      <div className="flex rounded-md border border-input p-1">
                        {(['week', 'month'] as const).map((cadence) => (
                          <button
                            key={cadence}
                            type="button"
                            aria-pressed={plan.cadence === cadence}
                            onClick={() => updatePlanCadence(category, cadence)}
                            className={cn(
                              'rounded px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                              plan.cadence === cadence
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-secondary'
                            )}
                          >
                            Per {cadence}
                          </button>
                        ))}
                      </div>
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <DataSurface className="flex flex-col bg-[hsl(var(--color-surface-container-low))]">
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
        <DataSurface className="bg-[hsl(var(--color-surface-container-low))]">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-headline-sm">Training Distribution</h3>
              <span className="text-xs text-muted-foreground">
                {stats.trainingDataRange}
              </span>
            </div>
            <div
              className="flex rounded-lg border border-border bg-secondary/20 p-1"
              aria-label="Training distribution timeframe"
            >
              {([30, 90, 'all'] as const).map((window) => (
                <button
                  key={window}
                  type="button"
                  aria-pressed={distributionWindow === window}
                  onClick={() => setDistributionWindow(window)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    distributionWindow === window
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {window === 'all' ? 'All time' : `${window} days`}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-label-md text-muted-foreground">
                Session Types
              </p>
              {stats.categoryStats.map((cat) => (
                <div key={cat.name} className="flex items-center">
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-medium leading-none">
                        {cat.name}
                      </p>
                      <span className="text-body-sm font-semibold text-muted-foreground">
                        {cat.count}
                      </span>
                    </div>
                    <div className="flex h-2 w-full rounded-full bg-secondary">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          resolveDashboardCategoryBarClass(cat.name)
                        )}
                        style={{
                          width: `${(cat.count / stats.maxCategoryCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <p className="text-label-md text-muted-foreground">
                Top Techniques
              </p>
              {stats.topTechniques.map((tech, idx) => (
                <div key={tech.name} className="flex items-center">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {tech.name}
                    </p>
                    <div className="flex h-2 w-full rounded-full bg-secondary">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          resolveDashboardTechniqueBarClass(idx)
                        )}
                        style={{
                          width: `${(tech.count / stats.maxTechniqueCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="ml-4 text-sm font-medium">{tech.count}x</div>
                </div>
              ))}
            </div>
          </div>
        </DataSurface>
      </div>
    </div>
  );
}
