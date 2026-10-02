import type {
  JudoSession,
  SessionCategory,
  TrainingPlanPreferences,
} from './types';
import { SESSION_CATEGORIES } from './types';
import {
  addCalendarDays,
  formatDateLabel,
  formatRelativeDistanceToNowStrict,
  parseDateOnly,
} from './utils';

export type DashboardDistributionWindow = 30 | 90 | 'all';

export interface DashboardOverviewStats {
  totalSessions: number;
  avgEffort: string;
  topTechniques: Array<{ name: string; count: number }>;
  categoryStats: Array<{ name: string; count: number }>;
  maxCategoryCount: number;
  maxTechniqueCount: number;
  topCategory: string;
  recentEfforts: Array<{
    date: string;
    timestamp: string;
    effort: number;
  }>;
  rollingRangeLabel: string;
  trainingDataRange: string;
  latestSessionLabel: string;
  needsTrainingNudge: boolean;
  sessionsInLastFortnight: number;
  rollingPlan: Array<{
    category: SessionCategory;
    completed: number;
    cadence: 'week' | 'month';
    effectiveTarget: number;
    remaining: number;
    isComplete: boolean;
  }>;
  completedRollingTarget: number;
  effectiveRollingTarget: number;
  nextFocus: string;
  remainingPlanSessions: number;
  coachingInsight: {
    eyebrow: string;
    title: string;
    detail: string;
  };
  effortInsight: {
    title: string;
    detail: string;
  };
  recentEffortAverage: number | null;
}

interface DashboardOverviewStatsInput {
  sessions: JudoSession[];
  enabledCategories: SessionCategory[];
  trainingPlan: TrainingPlanPreferences;
  distributionWindow: DashboardDistributionWindow;
  now?: Date;
}

function sortSessionsNewestFirst(sessions: JudoSession[]): JudoSession[] {
  return [...sessions].sort(
    (left, right) =>
      parseDateOnly(right.date).getTime() - parseDateOnly(left.date).getTime()
  );
}

function getDistributionStats(
  sortedSessions: JudoSession[],
  enabledCategories: SessionCategory[],
  distributionWindow: DashboardDistributionWindow,
  now: Date
) {
  const distributionStart =
    distributionWindow === 'all'
      ? null
      : addCalendarDays(now, -(distributionWindow - 1));
  const distributionSessions = distributionStart
    ? sortedSessions.filter(
        (session) => parseDateOnly(session.date) >= distributionStart
      )
    : sortedSessions;
  const techniqueCount: Record<string, number> = {};
  const categoryCount: Partial<Record<SessionCategory, number>> =
    Object.fromEntries(enabledCategories.map((category) => [category, 0]));

  distributionSessions.forEach((session) => {
    const techniques = Array.isArray(session.techniques)
      ? session.techniques
      : [];
    techniques.forEach((technique) => {
      techniqueCount[technique] = (techniqueCount[technique] ?? 0) + 1;
    });
    if (categoryCount[session.category] !== undefined) {
      categoryCount[session.category] =
        (categoryCount[session.category] ?? 0) + 1;
    }
  });

  const topTechniques = Object.entries(techniqueCount)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const categoryStats = enabledCategories.map((name) => ({
    name,
    count: categoryCount[name] ?? 0,
  }));
  const maxCategoryCount = Math.max(
    ...categoryStats.map((category) => category.count),
    1
  );
  const maxTechniqueCount = Math.max(
    ...topTechniques.map((technique) => technique.count),
    1
  );
  const topCategory =
    [...categoryStats].sort((left, right) => right.count - left.count)[0]
      ?.name ?? 'Technical';
  const sessionDates = sortedSessions
    .map((session) => parseDateOnly(session.date))
    .sort((left, right) => left.getTime() - right.getTime());
  const firstSessionDate = sessionDates[0];
  const latestSessionDate = sessionDates[sessionDates.length - 1];

  return {
    topTechniques,
    categoryStats,
    maxCategoryCount,
    maxTechniqueCount,
    topCategory,
    rollingStart: addCalendarDays(now, -29),
    latestSessionDate,
    trainingDataRange:
      distributionWindow === 'all'
        ? `${firstSessionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${latestSessionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `Last ${distributionWindow} days`,
  };
}

function getRollingPlanStats(
  sortedSessions: JudoSession[],
  enabledCategories: SessionCategory[],
  trainingPlan: TrainingPlanPreferences,
  now: Date
) {
  const rollingStart = addCalendarDays(now, -29);
  const completedByCategory = Object.fromEntries(
    SESSION_CATEGORIES.map((category) => [category, 0])
  ) as Record<SessionCategory, number>;
  sortedSessions.forEach((session) => {
    if (parseDateOnly(session.date) >= rollingStart) {
      completedByCategory[session.category] += 1;
    }
  });

  const rollingPlan = enabledCategories.map((category) => {
    const plan = trainingPlan.categories[category];
    const effectiveTarget =
      plan.cadence === 'week'
        ? Math.round(plan.targetSessions * (30 / 7))
        : plan.targetSessions;
    const completed = completedByCategory[category];
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

  return {
    rollingPlan,
    nextPlanItem,
    completedRollingTarget,
    effectiveRollingTarget,
    remainingPlanSessions,
  };
}

function getEffortStats(sortedSessions: JudoSession[], now: Date) {
  const lastFortnight = addCalendarDays(now, -13);
  const recentEffortSessions = sortedSessions.filter(
    (session) => parseDateOnly(session.date) >= lastFortnight
  );
  const recentEffortAverage = recentEffortSessions.length
    ? recentEffortSessions.reduce((total, session) => total + session.effort, 0) /
      recentEffortSessions.length
    : null;
  const priorFortnight = addCalendarDays(now, -27);
  const earlierEffortSessions = sortedSessions.filter((session) => {
    const date = parseDateOnly(session.date);
    return date >= priorFortnight && date < lastFortnight;
  });
  const earlierEffortAverage = earlierEffortSessions.length
    ? earlierEffortSessions.reduce((total, session) => total + session.effort, 0) /
      earlierEffortSessions.length
    : null;

  return {
    sessionsInLastFortnight: recentEffortSessions.length,
    recentEffortAverage,
    earlierEffortAverage,
  };
}

function getEffortInsight(
  sessionsInLastFortnight: number,
  recentEffortAverage: number | null,
  earlierEffortAverage: number | null,
  expectedFortnightSessions: number
) {
  if (sessionsInLastFortnight < 2) {
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
}

function getCoachingInsight(
  remainingPlanSessions: number,
  nextPlanItem:
    | { category: SessionCategory; remaining: number }
    | undefined
) {
  if (remainingPlanSessions === 0) {
    return {
      eyebrow: 'Plan complete',
      title: 'Your 30-day plan is on track.',
      detail:
        'Keep the rhythm steady, or adjust the plan if your availability has changed.',
    };
  }
  const nextCategory = nextPlanItem?.category ?? 'A training';
  const nextRemaining = nextPlanItem?.remaining ?? 0;
  return {
    eyebrow: 'Next best step',
    title: `${nextCategory} session is the clearest next move.`,
    detail: `${remainingPlanSessions} planned ${remainingPlanSessions === 1 ? 'session remains' : 'sessions remain'} in this 30-day window. ${nextRemaining} ${nextPlanItem?.category ?? ''} ${nextRemaining === 1 ? 'session is' : 'sessions are'} still to go.`,
  };
}

export function calculateDashboardOverviewStats({
  sessions,
  enabledCategories,
  trainingPlan,
  distributionWindow,
  now = new Date(),
}: DashboardOverviewStatsInput): DashboardOverviewStats | null {
  if (sessions.length === 0) return null;

  const sortedSessions = sortSessionsNewestFirst(sessions);
  const distributionStats = getDistributionStats(
    sortedSessions,
    enabledCategories,
    distributionWindow,
    now
  );
  const planStats = getRollingPlanStats(
    sortedSessions,
    enabledCategories,
    trainingPlan,
    now
  );
  const effortStats = getEffortStats(sortedSessions, now);
  const avgEffort =
    sessions.reduce((total, session) => total + session.effort, 0) /
    sessions.length;
  const daysSinceLatestSession = Math.max(
    0,
    Math.floor(
      (now.getTime() - distributionStats.latestSessionDate.getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );
  const expectedFortnightSessions = planStats.effectiveRollingTarget / 2;
  const recentEfforts = sortedSessions
    .slice(0, 7)
    .reverse()
    .map((session) => ({
      date: parseDateOnly(session.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      timestamp: session.date,
      effort: session.effort,
    }));
  const {
    topTechniques,
    categoryStats,
    maxCategoryCount,
    maxTechniqueCount,
    topCategory,
    rollingStart,
    latestSessionDate,
    trainingDataRange,
  } = distributionStats;

  return {
    totalSessions: sessions.length,
    avgEffort: avgEffort.toFixed(1),
    topTechniques,
    categoryStats,
    maxCategoryCount,
    maxTechniqueCount,
    topCategory,
    trainingDataRange,
    recentEfforts,
    rollingRangeLabel: `${formatDateLabel(rollingStart, 'day-month-short')} – ${formatDateLabel(now, 'day-month-short')}`,
    latestSessionLabel: formatRelativeDistanceToNowStrict(
      latestSessionDate,
      now
    ),
    needsTrainingNudge: daysSinceLatestSession >= 14,
    sessionsInLastFortnight: effortStats.sessionsInLastFortnight,
    rollingPlan: planStats.rollingPlan,
    completedRollingTarget: planStats.completedRollingTarget,
    effectiveRollingTarget: planStats.effectiveRollingTarget,
    nextFocus: planStats.nextPlanItem?.category ?? 'Consistency',
    remainingPlanSessions: planStats.remainingPlanSessions,
    coachingInsight: getCoachingInsight(
      planStats.remainingPlanSessions,
      planStats.nextPlanItem
    ),
    effortInsight: getEffortInsight(
      effortStats.sessionsInLastFortnight,
      effortStats.recentEffortAverage,
      effortStats.earlierEffortAverage,
      expectedFortnightSessions
    ),
    recentEffortAverage: effortStats.recentEffortAverage,
  };
}
