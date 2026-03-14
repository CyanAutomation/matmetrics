export type EffortLevel = 0 | 1 | 2;

export interface JudoSession {
  id: string;
  date: string;
  techniques: string[];
  effort: EffortLevel;
  notes?: string;
  duration?: number; // in minutes
}

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  0: "Normal",
  1: "Hard",
  2: "Very Hard",
};

export const EFFORT_COLORS: Record<EffortLevel, string> = {
  0: "bg-blue-100 text-blue-700 border-blue-200",
  1: "bg-amber-100 text-amber-700 border-amber-200",
  2: "bg-red-100 text-red-700 border-red-200",
};