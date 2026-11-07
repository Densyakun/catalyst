import type { PersonalIndicators, SocialIndicators } from '@/lib/priority';

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
  id?: string;
  context: string;
  symptoms: string;
  constraints: string;
  goal: string;
  severity: number;
  frequency: string;
  tags: string[];
  personal_priority: number; // 個人重要度 (0.0 - 1.0)
  social_impact: number;     // 社会影響度 (0.0 - 1.0)
  priority_score: number;    // 最終優先度スコア
  social_priority_score?: number; // 社会課題としての優先度（個人と別枠）
  priority_reason?: string;  // 優先度の計算根拠
  personal_indicators?: PersonalIndicators; // 緊急度・影響度・解決可能性
  social_indicators?: SocialIndicators;     // 影響範囲・受益者数・持続性
  cluster_id?: string;       // 紐付くクラスターID
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
  id?: string;
  title: string;
  description: string;
  tags: string[];
  representative_problem_ids: string[];
  dynamic_ui?: {
    type: 'collaboration' | 'resource_share' | 'petition' | 'data_gathering';
    actionLabel: string;
    description: string;
    target_goal?: string;
  };
}
