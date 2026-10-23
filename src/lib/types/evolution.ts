/**
 * 自己進化エンジンの型定義
 * ユーザーの不満・欲求・興味と操作データを収集し、
 * AIがアプリ自体の改善提案とUIバリアントを生成する。
 */

// ============================================================
// フィードバック
// ============================================================

export type FeedbackCategory =
  | 'dissatisfaction'
  | 'desire'
  | 'interest'
  | 'bug'
  | 'praise'
  | 'other';

export type FeedbackSentiment = 'negative' | 'neutral' | 'positive';

export interface UserFeedback {
  id: string;
  user_id: string | null;
  category: FeedbackCategory;
  rating: number | null;
  message: string | null;
  context_path: string | null;
  context_feature: string | null;
  sentiment: FeedbackSentiment | null;
  created_at: string;
}

export interface CreateFeedbackRequest {
  category: FeedbackCategory;
  message?: string;
  rating?: number;
  context_path?: string;
  context_feature?: string;
}

// ============================================================
// 改善提案
// ============================================================

export type ProposalCategory = 'feature' | 'ux' | 'bug' | 'performance' | 'content';
export type ProposalStatus = 'proposed' | 'approved' | 'in_progress' | 'implemented' | 'rejected';

export interface EvolutionProposal {
  id: string;
  user_id: string | null;
  title: string;
  category: ProposalCategory;
  rationale: string;
  target_area: string | null;
  proposed_change: string | null;
  priority: number;
  evidence: string[];
  signals: EvolutionSignalsSnapshot;
  status: ProposalStatus;
  github_repo: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_pr_url: string | null;
  external_state: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// ユーザー通知（エージェント → Katalyse → ユーザー）
// ============================================================

export type NotificationKind = 'improvement' | 'info' | 'error';

export interface UserNotification {
  id: string;
  user_id: string | null;
  proposal_id: string | null;
  title: string;
  body: string | null;
  detail: string | null;
  link_url: string | null;
  kind: NotificationKind;
  is_read: boolean;
  created_at: string;
}

// ============================================================
// エージェント連携 API
// ============================================================

export interface AgentContextProposal {
  id: string;
  user_id: string | null;
  title: string;
  category: ProposalCategory;
  rationale: string;
  target_area: string | null;
  proposed_change: string | null;
  priority: number;
  evidence: string[];
  signals: EvolutionSignalsSnapshot;
  status: ProposalStatus;
  github_repo: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
}

export interface AgentContextResponse {
  proposals: AgentContextProposal[];
  related?: {
    feedback: string[];
    problems: string[];
    stats: EvolutionSignalsSnapshot;
  };
}

export interface AgentReportRequest {
  proposal_id: string;
  state?: string;
  issue_number?: number;
  issue_url?: string;
  repo?: string;
  pr_url?: string;
  summary?: string;
  detail?: string;
  notify?: boolean;
}

// ============================================================
// シグナル（自己進化の入力）
// ============================================================

export interface FeedbackSignal {
  category: FeedbackCategory;
  message: string;
  created_at: string;
}

export interface ActivitySignal {
  activity_type: string;
  count: number;
}

export interface EvolutionSignals {
  feedback: FeedbackSignal[];
  complaints: string[];
  desires: string[];
  interests: string[];
  lowSatisfaction: string[];
  problems: string[];
  stuckInsights: string[];
  messages: string[];
  activity: ActivitySignal[];
  stats: {
    feedbackCount: number;
    negativeCount: number;
    visitCount: number;
    errorCount: number;
    totalEvents: number;
  };
}

export type EvolutionSignalsSnapshot = Partial<EvolutionSignals['stats']>;

// ============================================================
// UIバリアント
// ============================================================

export type UIVariantStatus = 'proposed' | 'active' | 'archived';

export interface UIVariant {
  id: string;
  user_id: string | null;
  name: string;
  area: string;
  description: string | null;
  code: string;
  ast: unknown;
  status: UIVariantStatus;
  performance: UIVariantPerformance;
  source_proposal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UIVariantPerformance {
  impressions?: number;
  clicks?: number;
  dwell_ms?: number;
  score?: number;
}

export interface GenerateUIVariantRequest {
  area: string;
  name?: string;
  instruction?: string;
}
