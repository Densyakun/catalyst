export type TodayUrgency = 'high' | 'medium' | 'low';

export interface TodayAction {
  id: string;
  description: string | null;
  reason: string | null;
  type: string | null;
  cost: { time?: string; money?: number } | null;
  time_cost?: string | null;
  money_cost?: number | null;
  expected_gain: string | null;
  risk: string | null;
  link: string | null;
  is_recommended: boolean | null;
}

export interface TodayProblem {
  id: string;
  context: string;
  symptoms: string | null;
  constraints: string | null;
  goal: string | null;
  severity: number | null;
  priority: number | null;
  priority_score: number | null;
  status: string | null;
  created_at: string;
  actions?: TodayAction[];
}

export interface TodayInsight {
  id: string;
  insight_type: string;
  title: string;
  content: string;
  status: string;
  estimated_cost: { time?: string; money?: number } | null;
  created_at: string;
}

export interface TodayFocus {
  kind: 'problem' | 'insight';
  id: string;
  title: string;
  description: string;
  goal: string | null;
  urgency: TodayUrgency;
  reason: string;
  nextStep: string | null;
  cost: { time?: string; money?: number } | null;
  action: TodayAction | null;
  problem: TodayProblem | null;
  insight: TodayInsight | null;
}

export interface TodayStats {
  unsolvedProblems: number;
  solvedProblems: number;
  pendingInsights: number;
  pendingIdeas: number;
  activeProjects: number;
}

export interface TodayData {
  focus: TodayFocus | null;
  upNext: TodayFocus[];
  stats: TodayStats;
  isNewUser: boolean;
  updatedAt: string;
}
