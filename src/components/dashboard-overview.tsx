"use client"

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JudoSession, EFFORT_LABELS } from "@/lib/types";
import { TrendingUp, Award, Calendar, Zap } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface DashboardOverviewProps {
  sessions: JudoSession[];
}

export function DashboardOverview({ sessions }: DashboardOverviewProps) {
  const stats = useMemo(() => {
    if (sessions.length === 0) return null;

    const avgEffort = sessions.reduce((acc, s) => acc + s.effort, 0) / sessions.length;
    
    const techniqueCount: Record<string, number> = {};
    sessions.forEach(s => {
      s.techniques.forEach(t => {
        techniqueCount[t] = (techniqueCount[t] || 0) + 1;
      });
    });

    const topTechniques = Object.entries(techniqueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const recentEfforts = sessions.slice(0, 7).reverse().map(s => ({
      date: new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      effort: s.effort
    }));

    return {
      totalSessions: sessions.length,
      avgEffort: avgEffort.toFixed(1),
      topTechniques,
      recentEfforts
    };
  }, [sessions]);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-dashed border-muted-foreground/20">
        <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-xl font-semibold mb-2">No session data yet</h3>
        <p className="text-muted-foreground">Start logging your training sessions to see insights here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSessions}</div>
            <p className="text-xs text-muted-foreground">Practice makes progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Effort</CardTitle>
            <Zap className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgEffort}</div>
            <p className="text-xs text-muted-foreground">Intensity level (0-2 scale)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Technique</CardTitle>
            <Award className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {stats.topTechniques[0]?.name || "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Most practiced move</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consistency</CardTitle>
            <TrendingUp className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <p className="text-xs text-muted-foreground">Training regularly</p>
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
                  label: "Effort",
                  color: "hsl(var(--primary))"
                }
              }}
              className="h-full w-full"
            >
              <BarChart data={stats.recentEfforts}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis ticks={[0, 1, 2]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="effort" radius={[4, 4, 0, 0]}>
                   {stats.recentEfforts.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.effort === 0 ? "hsl(var(--primary) / 0.4)" : entry.effort === 1 ? "hsl(var(--primary) / 0.7)" : "hsl(var(--primary))"} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Top Techniques</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topTechniques.map((tech, idx) => (
                <div key={idx} className="flex items-center">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{tech.name}</p>
                    <div className="flex h-2 w-full rounded-full bg-secondary">
                      <div 
                        className="h-full rounded-full bg-accent" 
                        style={{ width: `${(tech.count / stats.totalSessions) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="ml-4 text-sm font-medium">{tech.count}x</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}