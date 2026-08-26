'use client';

import { useMemo } from 'react';
import { subDays } from 'date-fns';
import { parseDateOnly } from '@/lib/utils';
import type { JudoSession, SessionCategory, UserPreferences } from '@/lib/types';

export interface DashboardStats {
  avgEffort: number;
  topTechniques: Array<{ name: string; count: number }>;
  categoryStats: Array<{ name: string; count: number }>;
  topCategory: SessionCategory;
  recentEfforts: Array<{
    date: string;
    timestamp: string;
    effort: number;
  }>;
  firstSessionDate: Date;
  latestSessionDate: Date;
  daysSinceLatestSession: number;
  sessionsInRollingWindowByCategory: Record<SessionCategory, number>;
  sessionsInLastFortnight: number;
  rollingPlan: Array<{
    category: SessionCategory;
    effectiveTarget: number;
    completed: number;
    remaining: number;
    percentComplete: number;
  }>;
  maxCategoryCount: number;
  maxTechniqueCount: number;
  distributionSessions: JudoSession[];
}

/**
 * Custom hook that calculates dashboard statistics from sessions.
 * Encapsulates complex useMemo logic for stats derivation.
 */
export function useDashboardStats(
  sessions: JudoSession[],
  distributionWindow: 30 | 90 | 'all',
  enabledCategories: SessionCategory[],
  preferences: UserPreferences
): DashboardStats | null {
  return useMemo(() => {
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

    const topCategoryValue =
      Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      'Technical';
    const topCategory = (
      (['Technical', 'Randori', 'Shiai', 'Cardio', 'S&C'] as const).includes(
        topCategoryValue as any
      )
        ? topCategoryValue
        : 'Technical'
    ) as SessionCategory;

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
      const percentComplete =
        effectiveTarget > 0
          ? Math.round((completed / effectiveTarget) * 100)
          : 0;

      return {
        category,
        effectiveTarget,
        completed,
        remaining,
        percentComplete,
      };
    });

    return {
      avgEffort,
      topTechniques,
      categoryStats,
      topCategory,
      recentEfforts,
      firstSessionDate,
      latestSessionDate,
      daysSinceLatestSession,
      sessionsInRollingWindowByCategory,
      sessionsInLastFortnight,
      rollingPlan,
      maxCategoryCount,
      maxTechniqueCount,
      distributionSessions,
    };
  }, [sessions, distributionWindow, enabledCategories, preferences]);
}
