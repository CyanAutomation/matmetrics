export type EffortLevel = 0 | 1 | 2 | 3;

export interface JudoSession {
  id: string;
  date: string;
  techniques: string[];
  effort: EffortLevel;
  notes?: string;
  duration?: number; // in minutes
}

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  0: "Light",
  1: "Normal",
  2: "Hard",
  3: "Very Hard",
};

export const EFFORT_COLORS: Record<EffortLevel, string> = {
  0: "bg-slate-100 text-slate-700 border-slate-200",
  1: "bg-blue-100 text-blue-700 border-blue-200",
  2: "bg-amber-100 text-amber-700 border-amber-200",
  3: "bg-red-100 text-red-700 border-red-200",
};
