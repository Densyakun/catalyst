/**
 * 課題解決エンジンの型定義
 * チャット・リソース・目星・プロジェクト・コスト
 */

// ============================================================
// チャット（情報収集窓口）
// ============================================================

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  extracted_type?: 'problem' | 'resource' | 'info' | null;
  timestamp: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  messages: ChatMessage[];
  extracted_tags: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// リソース管理
// ============================================================

export type ResourceType = 'time' | 'money' | 'skill' | 'tool' | 'connection';

export interface UserResource {
  id: string;
  user_id: string;
  resource_type: ResourceType;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// 目星（情報フィルタリング）
// ============================================================

export type MarkedItemType = 'problem' | 'resource' | 'intent' | 'insight';

export interface MarkedItem {
  id: string;
  user_id: string;
  item_type: MarkedItemType;
  item_id: string;
  relevance_score: number;
  scoring_cost: number;
  layer: number;
  context: string | null;
  marked_at: string;
}

// ============================================================
// プロジェクト・タスク
// ============================================================

export type ProjectStatus = 'planning' | 'in_progress' | 'completed' | 'on_hold';
export type TaskStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'blocked';
export type TaskExecutionType = 'auto' | 'user' | 'hybrid';

export interface Project {
  id: string;
  user_id: string;
  insight_id: string | null;
  title: string;
  description: string | null;
  total_estimated_cost: number;
  total_actual_cost: number;
  is_social: boolean;
  estimated_beneficiaries: number | null;
  status: ProjectStatus;
  tasks?: ProjectTask[];
  created_at: string;
  updated_at: string;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  estimated_cost: number;
  actual_cost: number;
  execution_type: TaskExecutionType;
  depends_on: string[];
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  sort_order: number;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

// ============================================================
// コストモデル
// ============================================================

export type OperationType = 'marking' | 'scoring' | 'idea_generation' | 'task_execution' | 'decomposition';
export type FundingSource = 'user' | 'donation_pool';

export interface CostLogEntry {
  id: string;
  user_id: string;
  operation_type: OperationType;
  layer: number;
  input_item_ids: string[];
  actual_cost: number;
  is_social: boolean;
  funded_by: FundingSource;
  estimated_beneficiaries: number | null;
  actual_beneficiaries: number | null;
  estimated_user_share: number | null;
  actual_user_share: number | null;
  related_project_id: string | null;
  related_task_id: string | null;
  created_at: string;
}

export interface UserBalance {
  id: string;
  user_id: string;
  balance: number;
  total_charged: number;
  total_deposited: number;
  updated_at: string;
}

export interface DonationPool {
  balance: number;
  total_donated: number;
  total_spent: number;
}

export interface Donation {
  id: string;
  user_id: string;
  amount: number;
  related_insight_id: string | null;
  related_project_id: string | null;
  created_at: string;
}

export interface BeneficiaryStat {
  id: string;
  category: string;
  tags: string[];
  avg_beneficiaries: number;
  median_beneficiaries: number;
  sample_count: number;
}

// ============================================================
// API リクエスト/レスポンス型
// ============================================================

export interface SendMessageRequest {
  conversation_id?: string;
  message: string;
}

export interface SendMessageResponse {
  conversation_id: string;
  reply: ChatMessage;
  extracted_items: {
    problems: string[];
    resources: string[];
    info: string[];
  };
}

export interface CreateResourceRequest {
  resource_type: ResourceType;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateIdeasRequest {
  marked_item_ids: string[];
}

export interface DecomposeProjectRequest {
  insight_id: string;
  title: string;
  description: string;
  is_social: boolean;
}

export interface ExecuteTaskRequest {
  task_id: string;
}

export interface CostEstimate {
  total_cost: number;
  user_share: number;
  user_share_range: { min: number; max: number } | null;
  estimated_beneficiaries: number | null;
  is_social: boolean;
  funded_by: FundingSource;
}
