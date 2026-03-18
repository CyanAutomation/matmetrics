'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JudoSession } from '@/lib/types';
import { Award, Calendar, Zap, Target } from 'lucide-react';
import { RessaImage } from '@/components/ressa-image';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { cn, parseDateOnly } from '@/lib/utils';

interface DashboardOverviewProps {
  sessions: JudoSession[];
}

export function DashboardOverview({ sessions }: DashboardOverviewProps) {
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
        effort: s.effort,
      }));

    const topCategory = Object.entries(categoryCount).sort(
      (a, b) => b[1] - a[1]
    )[0][0];

    return {
      totalSessions: sessions.length,
      avgEffort: avgEffort.toFixed(1),
      topTechniques,
      categoryStats,
      topCategory,
      recentEfforts,
    };
  }, [sessions]);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-dashed border-muted-foreground/20">
        <RessaImage
          pose={5}
          size="medium"
          alt="Ressa looking forward to your training data"
        />
        <h3 className="text-xl font-semibold mb-2 mt-4">No session data yet</h3>
        <p className="text-muted-foreground">
          Start logging your training sessions to see insights here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Sessions
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions}</div>
            <p className="text-xs text-muted-foreground">
              Practice makes progress
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Focus Area</CardTitle>
            <Target className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.topCategory}</div>
            <p className="text-xs text-muted-foreground">
              Primary training type
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Technique</CardTitle>
            <Award className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {stats.topTechniques[0]?.name || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">Most practiced move</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Effort</CardTitle>
            <Zap className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgEffort}</div>
            <p className="text-xs text-muted-foreground">
              Intensity level (1-5 scale)
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Recent Effort Levels</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ChartContainer
              config={{
                effort: {
                  label: 'Effort',
                  color: 'hsl(var(--primary))',
                },
              }}
              className="h-full w-full"
            >
              <BarChart data={stats.recentEfforts}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis ticks={[0, 1, 2, 3, 4, 5]} domain={[0, 5]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="effort" radius={[4, 4, 0, 0]}>
                  {stats.recentEfforts.map((entry, index) => {
                    let fill = 'hsl(var(--primary))';
                    if (entry.effort === 1) fill = 'hsl(var(--primary) / 0.2)';
                    else if (entry.effort === 2)
                      fill = 'hsl(var(--primary) / 0.4)';
                    else if (entry.effort === 3)
                      fill = 'hsl(var(--primary) / 0.6)';
                    else if (entry.effort === 4)
                      fill = 'hsl(var(--primary) / 0.8)';
                    return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Training Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Session Types
                </p>
                {stats.categoryStats.map((cat, idx) => (
                  <div key={idx} className="flex items-center">
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-sm font-medium leading-none">
                          {cat.name}
                        </p>
                        <span className="text-xs font-bold text-muted-foreground">
                          {cat.count}
                        </span>
                      </div>
                      <div className="flex h-2 w-full rounded-full bg-secondary">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            cat.name === 'Technical'
                              ? 'bg-sky-500'
                              : cat.name === 'Randori'
                                ? 'bg-indigo-500'
                                : 'bg-rose-500'
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
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                    <div className="ml-4 text-sm font-medium">
                      {tech.count}x
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
