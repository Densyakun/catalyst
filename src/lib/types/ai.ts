/**
 * Intake エージェントの各ステップの型
 */
export interface IntakeStep {
  type: 'question' | 'result';
  question?: string;
  options?: string[];
  is_final: boolean;
}

/**
 * 構造化された課題の型
 */
export interface StructuredProblem {
  context: string;
  symptoms: string;
  constraints: string;
  goal: string;
  severity: number;
  frequency: string;
  tags: string[];
  priority?: number;
  status?: 'unsolved' | 'solving' | 'solved';
}

/**
 * 解決策（アクション）の型
 */
export interface ProposedAction {
  type: string;
  description: string;
  reason: string;
  cost: {
    time: string;
    money: number;
  };
  expectedGain: string;
  risk: string;
  link?: string;
  isRecommended: boolean;
  problemId: string;
}

/**
 * 課題クラスター（共有課題）の型
 */
export interface ProblemCluster {
  title: string;
  description: string;
  tags: string[];
  representative_problem_ids: string[];
}
