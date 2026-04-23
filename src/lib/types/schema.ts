/**
 * requirements.md に基づくデータスキーマの定義
 */

export type ProblemStatus = 'unsolved' | 'solved';

export interface Problem {
  id?: string;
  context: string;      // 課題の文脈
  symptoms: string;     // 発生している症状
  constraints: string;  // 制約条件
  goal: string;         // 達成したいゴール
  severity: number;     // 深刻度 (1-10)
  frequency: number;    // 頻度
  priority: number;     // 優先度 (計算結果)
  status: ProblemStatus;
  tags?: string[];      // 柔軟なドメイン情報
  createdAt?: string;
}

export interface Action {
  id?: string;
  problemId: string;
  type: string;         // 行動の種類
  description: string;  // 具体的な行動内容
  cost: {
    time: string;
    money: number;
  };
  expectedGain: string; // 期待される効果
  risk: string;         // リスク
  link?: string;        // 実行用リンク
  isRecommended: boolean;
}

export interface Outcome {
  id?: string;
  actionId: string;
  didExecute: boolean;
  delta: number;        // 改善量
  satisfaction: number; // 満足度 (1-10)
  complaint?: string;   // 不満点
  feedbackDate: string;
}
