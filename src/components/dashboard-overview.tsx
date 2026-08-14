'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { JudoSession } from '@/lib/types';
import { Award, Calendar, PlusCircle, Zap, Target } from 'lucide-react';
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
}

export function DashboardOverview({
  sessions,
  onLogSession,
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
    <div className="reveal-fade-up max-w-4xl mx-auto w-full">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-headline-md">Training snapshot</h2>
          <p className="text-sm text-muted-foreground">
            Based on all logged sessions from {stats.periodLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Latest session {stats.latestSessionLabel}
          </p>
          {onLogSession && stats.needsTrainingNudge ? (
            <Button size="sm" onClick={onLogSession}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Log a session
            </Button>
          ) : null}
        </div>
      </div>
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-label-md">Logged Sessions</span>
          </div>
          <div className="text-display-sm font-bold text-foreground tabular-nums">
            {stats.totalSessions}
          </div>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span className="text-label-md">Focus Area</span>
          </div>
          <div className="text-display-sm font-bold text-foreground truncate">
            {stats.topCategory}
          </div>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Award className="h-4 w-4" />
            <span className="text-label-md">Top Technique</span>
          </div>
          <div className="text-display-sm font-bold text-foreground truncate">
            {stats.topTechniques[0]?.name || '—'}
          </div>
        </DataSurface>
        <DataSurface className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="h-4 w-4" />
            <span className="text-label-md">Avg Effort</span>
          </div>
          <div className="text-display-sm font-bold text-foreground tabular-nums">
            {stats.avgEffort}
            <span className="text-base font-normal text-muted-foreground">
              {' '}
              / 5
            </span>
          </div>
        </DataSurface>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Effort — surface, not card */}
        <DataSurface>
          <h3 className="text-headline-sm mb-6">Recent Effort Levels</h3>
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
                        tabIndex={0}
                        role="button"
                        aria-label={`Effort ${entry.effort} on ${entry.date}`}
                        onMouseEnter={() => setActiveEffortIndex(index)}
                        onMouseLeave={() => setActiveEffortIndex(null)}
                        onFocus={() => setActiveEffortIndex(index)}
                        onBlur={() => setActiveEffortIndex(null)}
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
