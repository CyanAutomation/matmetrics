'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict, subDays } from 'date-fns';
import {
  JudoSession,
  SessionCategory,
  TrainingPlanPreferences,
} from '@/lib/types';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Dumbbell,
  Flame,
  Target,
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
import { resolveDashboardCategoryBarClass } from '@/lib/ui-semantic';
import { cn, parseDateOnly } from '@/lib/utils';
import { saveTrainingPlanPreference } from '@/lib/user-preferences';
import { DataSurface } from '@/components/ui/data-display';

interface DashboardOverviewProps {
  sessions: JudoSession[];
  onLogSession?: () => void;
  isRefreshing?: boolean;
}

export function DashboardOverview({
  sessions,
  onLogSession,
  isRefreshing = false,
}: DashboardOverviewProps) {
  const { canSavePreferences, preferences, user } = useAuth();
  const [selectedEffortIndex, setSelectedEffortIndex] = useState<number | null>(
    null
  );
  const [distributionWindow, setDistributionWindow] = useState<30 | 90 | 'all'>(
    30
  );
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
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
    const categoryCount: Record<string, number> = {
      Technical: 0,
      Randori: 0,
      Shiai: 0,
    };

    distributionSessions.forEach((s) => {
      s.techniques.forEach((t) => {
        techniqueCount[t] = (techniqueCount[t] || 0) + 1;
      });
      if (s.category) {
        categoryCount[s.category] = (categoryCount[s.category] || 0) + 1;
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
    const sessionsInRollingWindowByCategory: Record<SessionCategory, number> = {
      Technical: 0,
      Randori: 0,
      Shiai: 0,
    };
    sortedSessions.forEach((session) => {
      if (parseDateOnly(session.date) >= rollingStart) {
        sessionsInRollingWindowByCategory[session.category] += 1;
      }
    });
    const lastFortnight = subDays(now, 13);
    const sessionsInLastFortnight = sortedSessions.filter(
      (session) => parseDateOnly(session.date) >= lastFortnight
    ).length;

    const recentAverage =
      recentEfforts
        .slice(-3)
        .reduce((total, session) => total + session.effort, 0) /
      Math.min(recentEfforts.length, 3);
    const earlierEfforts = recentEfforts.slice(-6, -3);
    const earlierAverage = earlierEfforts.length
      ? earlierEfforts.reduce((total, session) => total + session.effort, 0) /
        earlierEfforts.length
      : null;
    const rollingPlan = (['Technical', 'Randori', 'Shiai'] as const).map(
      (category) => {
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
      }
    );
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
      recentAverage,
      earlierAverage,
    };
  }, [distributionWindow, preferences.trainingPlan, sessions]);

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
    <div className="reveal-fade-up max-w-5xl mx-auto w-full">
      <div className="mb-6">
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-headline-sm">Your rhythm</h3>
        <p className="text-xs text-muted-foreground">
          Last 30 days · {stats.rollingRangeLabel}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <DataSurface className="flex flex-col gap-2 border-primary/20 bg-primary-fixed/35 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-label-md">Plan progress</span>
          </div>
          <div className="text-display-sm font-bold text-foreground tabular-nums">
            {stats.completedRollingTarget}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              / {stats.effectiveRollingTarget}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Last 30 days</p>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Flame className="h-4 w-4" />
            <span className="text-label-md">14-day cadence</span>
          </div>
          <div className="text-display-sm font-bold text-foreground tabular-nums">
            {stats.sessionsInLastFortnight}
          </div>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span className="text-label-md">Next focus</span>
          </div>
          <div className="text-display-sm font-bold text-foreground truncate">
            {stats.nextFocus}
          </div>
        </DataSurface>
      </div>

      <DataSurface className="mb-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-label-md text-primary">Your realistic plan</p>
            <h3 className="text-headline-sm">
              Train to your availability, not an ideal week.
            </h3>
          </div>
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
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {stats.rollingPlan.map((item) => (
            <button
              key={item.category}
              type="button"
              onClick={onLogSession}
              disabled={!onLogSession}
              className="flex min-h-20 items-center gap-3 rounded-xl bg-secondary/30 p-4 text-left transition-colors hover:bg-secondary/50 disabled:cursor-default disabled:hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {item.isComplete ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <span>
                <span className="block font-semibold">{item.category}</span>
                <span className="block text-sm text-muted-foreground">
                  {item.completed}/{item.effectiveTarget} in the last 30 days
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Target: {item.cadence === 'week' ? 'per week' : 'per month'}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Your weekly targets are converted to a rolling 30-day target, so every
          session type is measured on the same timeframe.
        </p>
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
            {(['Technical', 'Randori', 'Shiai'] as const).map((category) => {
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Effort — surface, not card */}
        <DataSurface>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-headline-sm">Recent Effort</h3>
            <Dumbbell className="h-5 w-5 text-primary" />
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            {stats.earlierAverage === null
              ? `Your latest three sessions average ${stats.recentAverage.toFixed(1)} / 5.`
              : `Last three average ${stats.recentAverage.toFixed(1)} / 5, ${stats.recentAverage >= stats.earlierAverage ? 'up' : 'down'} from ${stats.earlierAverage.toFixed(1)}.`}
          </p>
          <div
            className="grid grid-cols-7 gap-2"
            aria-label="Effort across your last seven sessions"
          >
            {stats.recentEfforts.map((entry, index) => {
              const isSelected = selectedEffortIndex === index;
              return (
                <button
                  key={`${entry.timestamp}-${index}`}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    setSelectedEffortIndex(isSelected ? null : index)
                  }
                  className={cn(
                    'group flex min-h-36 flex-col justify-end rounded-lg border bg-secondary/20 p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent hover:border-primary/40'
                  )}
                >
                  <span className="mb-2 text-xs font-medium text-muted-foreground">
                    {entry.date}
                  </span>
                  <span className="flex h-20 items-end rounded bg-muted/70 p-1">
                    <span
                      className="w-full rounded-sm bg-primary transition-[height] duration-300"
                      style={{ height: `${entry.effort * 20}%` }}
                    />
                  </span>
                  <span className="mt-2 text-sm font-semibold tabular-nums">
                    {entry.effort}/5
                  </span>
                  {isSelected && (
                    <span className="text-xs text-muted-foreground">
                      Selected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Select a session to keep its value in view. No hover is required.
          </p>
        </DataSurface>

        {/* Training Distribution — surface, not card */}
        <DataSurface>
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
              {stats.categoryStats.map((cat, idx) => (
                <div key={idx} className="flex items-center">
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
                <div key={idx} className="flex items-center">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {tech.name}
                    </p>
                    <div className="flex h-2 w-full rounded-full bg-secondary">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          [
                            'bg-primary',
                            'bg-sky-500',
                            'bg-violet-500',
                            'bg-amber-500',
                            'bg-emerald-500',
                          ][idx]
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
