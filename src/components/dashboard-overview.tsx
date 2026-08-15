'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { JudoSession } from '@/lib/types';
import {
  Award,
  Calendar,
  ChevronRight,
  Dumbbell,
  Flame,
  Sparkles,
  Target,
} from 'lucide-react';
import { RessaImage } from '@/components/ressa-image';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { resolveDashboardCategoryBarClass } from '@/lib/ui-semantic';
import { cn, parseDateOnly } from '@/lib/utils';
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
  const [activeEffortIndex, setActiveEffortIndex] = useState<number | null>(
    null
  );
  const stats = useMemo(() => {
    if (sessions.length === 0) return null;

    const avgEffort =
      sessions.reduce((acc, s) => acc + s.effort, 0) / sessions.length;

    const techniqueCount: Record<string, number> = {};
    const categoryCount: Record<string, number> = {
      Technical: 0,
      Randori: 0,
      Shiai: 0,
    };

    sessions.forEach((s) => {
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

    const recentEfforts = sessions
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

    const topCategory = Object.entries(categoryCount).sort(
      (a, b) => b[1] - a[1]
    )[0][0];
    const sessionDates = sessions
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

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - 6);
    const sessionsThisWeek = sessions.filter(
      (session) => parseDateOnly(session.date).getTime() >= weekStart.getTime()
    ).length;
    const weeklyTarget = 3;

    const dateKeys = new Set(sessions.map((session) => session.date));
    let trainingStreak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (dateKeys.has(cursor.toISOString().slice(0, 10))) {
      trainingStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

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
    const leastPracticedCategory = Object.entries(categoryCount).sort(
      ([, left], [, right]) => left - right
    )[0]?.[0];

    const nextAction =
      daysSinceLatestSession >= 7
        ? {
            eyebrow: 'Get back on the mat',
            title: `It has been ${daysSinceLatestSession} days since your last session.`,
            description:
              'A short technical session is enough to rebuild momentum.',
            action: 'Log a technical session',
          }
        : {
            eyebrow: 'Your next best session',
            title: `Balance your week with ${leastPracticedCategory?.toLowerCase() ?? 'technical'} work.`,
            description: `Your focus is currently ${topCategory.toLowerCase()}; a deliberate change of pace will round out your practice.`,
            action: `Log a ${leastPracticedCategory?.toLowerCase() ?? 'technical'} session`,
          };

    return {
      totalSessions: sessions.length,
      avgEffort: avgEffort.toFixed(1),
      topTechniques,
      categoryStats,
      topCategory,
      recentEfforts,
      periodLabel: `${firstSessionDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })} – ${latestSessionDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`,
      latestSessionLabel: formatDistanceToNowStrict(latestSessionDate, {
        addSuffix: true,
      }),
      needsTrainingNudge: daysSinceLatestSession >= 14,
      trainingStreak,
      sessionsThisWeek,
      weeklyTarget,
      recentAverage,
      earlierAverage,
      nextAction,
    };
  }, [sessions]);

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
          <p className="text-label-md text-primary">Today&apos;s training</p>
          <h2 className="text-display-sm mt-1">Train with a clear purpose.</h2>
          <p className="text-sm text-muted-foreground">
            {isRefreshing
              ? 'Updating your training data…'
              : `Last session ${stats.latestSessionLabel} · ${stats.sessionsThisWeek} of ${stats.weeklyTarget} sessions this week`}
          </p>
        </div>
      </div>
      <DataSurface className="mb-6 overflow-hidden border border-primary/15 bg-[linear-gradient(135deg,hsl(var(--primary-fixed)/0.7),hsl(var(--card))_62%)] p-0">
        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              Your plan
            </div>
            <h3 className="text-headline-md">{stats.nextAction.title}</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {stats.nextAction.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-background/70 px-3 py-1.5 font-medium text-foreground">
                Weekly rhythm: {stats.sessionsThisWeek}/{stats.weeklyTarget}
              </span>
              <span className="text-muted-foreground">
                Focus: {stats.topCategory}
              </span>
            </div>
          </div>
          {onLogSession && (
            <Button
              variant="outline"
              onClick={onLogSession}
              className="min-h-11 justify-between sm:justify-center"
            >
              {stats.nextAction.action}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DataSurface>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-headline-sm">This week at a glance</h3>
        <p className="text-xs text-muted-foreground">{stats.periodLabel}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <DataSurface className="flex flex-col gap-2 border-primary/20 bg-primary-fixed/35 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-label-md">Weekly rhythm</span>
          </div>
          <div className="text-display-sm font-bold text-foreground tabular-nums">
            {stats.sessionsThisWeek}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              / {stats.weeklyTarget}
            </span>
          </div>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Flame className="h-4 w-4" />
            <span className="text-label-md">Training streak</span>
          </div>
          <div className="text-display-sm font-bold text-foreground tabular-nums">
            {stats.trainingStreak || '—'}
          </div>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span className="text-label-md">Needs attention</span>
          </div>
          <div className="text-display-sm font-bold text-foreground truncate">
            {stats.nextAction.title.match(/with (.+) work\./)?.[1] ??
              'Consistency'}
          </div>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Award className="h-4 w-4" />
            <span className="text-label-md">Top technique</span>
          </div>
          <div className="text-display-sm font-bold text-foreground truncate">
            {stats.topTechniques[0]?.name || '—'}
          </div>
        </DataSurface>
      </div>

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
          <div className="h-[300px]">
            <ChartContainer
              config={{
                primary: {
                  label: 'Effort — Level 5',
                  color: 'hsl(var(--primary))',
                  markerShape: 'circle',
                  strokeStyle: 'solid',
                },
                secondary: {
                  label: 'Effort — Level 4',
                  color: 'hsl(var(--secondary))',
                  markerShape: 'square',
                  strokeStyle: 'solid',
                },
                tertiary: {
                  label: 'Effort — Level 3',
                  color: 'hsl(var(--tertiary))',
                  markerShape: 'diamond',
                  strokeStyle: 'dashed',
                },
                'primary-container': {
                  label: 'Effort — Level 2',
                  color: 'hsl(var(--primary-container))',
                  markerShape: 'triangle',
                  strokeStyle: 'dotted',
                },
                'secondary-container': {
                  label: 'Effort — Level 1',
                  color: 'hsl(var(--secondary))',
                  markerShape: 'triangle',
                  strokeStyle: 'dotted',
                },
              }}
              className="h-full w-full"
            >
              <BarChart
                data={stats.recentEfforts}
                barCategoryGap="28%"
                margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="hsl(var(--foreground) / 0.16)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={24}
                  tick={{
                    fill: 'hsl(var(--foreground) / 0.78)',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                />
                <YAxis
                  ticks={[0, 1, 2, 3, 4, 5]}
                  domain={[0, 5]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={28}
                  tick={{
                    fill: 'hsl(var(--foreground) / 0.72)',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                  label={{
                    value: 'Effort',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 0,
                    fill: 'hsl(var(--foreground) / 0.72)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      valueUnit="/5"
                      detailFormatter={(item) => (
                        <div className="grid gap-1">
                          <span className="font-medium">
                            {item.seriesLabel}
                          </span>
                          <span className="font-mono tabular-nums">
                            {item.valueWithUnit}
                          </span>
                          <span className="text-muted-foreground">
                            {item.date || item.timestamp}
                          </span>
                          {item.delta !== undefined && (
                            <span className="text-muted-foreground">
                              Δ {item.delta}
                            </span>
                          )}
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="effort" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {stats.recentEfforts.map((entry, index) => {
                    const seriesTokenByEffort = {
                      1: 'secondary-container',
                      2: 'primary-container',
                      3: 'tertiary',
                      4: 'secondary',
                      5: 'primary',
                    } as const;
                    const token =
                      seriesTokenByEffort[
                        entry.effort as keyof typeof seriesTokenByEffort
                      ] ?? 'primary';

                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={`var(--color-${token})`}
                        fillOpacity={
                          activeEffortIndex === null ||
                          activeEffortIndex === index
                            ? 0.96
                            : 0.42
                        }
                        stroke="hsl(var(--background))"
                        strokeWidth={1.5}
                        onMouseEnter={() => setActiveEffortIndex(index)}
                        onMouseLeave={() => setActiveEffortIndex(null)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </DataSurface>

        {/* Training Distribution — surface, not card */}
        <DataSurface>
          <h3 className="text-headline-sm mb-6">Training Distribution</h3>
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
                          width: `${(cat.count / stats.totalSessions) * 100}%`,
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
                        className="h-full rounded-full bg-primary/60"
                        style={{
                          width: `${(tech.count / stats.totalSessions) * 100}%`,
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
