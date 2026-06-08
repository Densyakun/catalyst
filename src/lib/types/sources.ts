export type SourceType = 'google_docs';

export interface UserSource {
  id: string;
  user_id: string;
  source_type: SourceType;
  source_name: string;
  source_config: GoogleDocsConfig;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface GoogleDocsConfig {
  doc_id: string;
  doc_title?: string;
  doc_url?: string;
}

export interface SourceSnapshot {
  id: string;
  source_id: string;
  content: string;
  summary: string | null;
  extracted_intents: ExtractedIntent[] | null;
  content_hash: string | null;
  created_at: string;
}

export interface ExtractedIntent {
  description: string;
  category: string;
  urgency: 'low' | 'medium' | 'high';
  related_text: string;
}

export type InsightType = 'detected_problem' | 'suggestion' | 'memo_rewrite';
export type InsightStatus = 'pending' | 'in_progress' | 'completed' | 'on_hold';

export interface AutoInsight {
  id: string;
  user_id: string;
  source_snapshot_id: string | null;
  insight_type: InsightType;
  title: string;
  content: string;
  proposed_action: ProposedInsightAction | null;
  estimated_cost: { time: string; money: number } | null;
  auto_proceed: boolean;
  status: InsightStatus;
  diff_data: DiffData | null;
  created_at: string;
  updated_at: string;
}

export interface ProposedInsightAction {
  type: string;
  description: string;
  next_steps: string[];
}

export interface DiffChange {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  original: string;
  revised: string;
  applied?: boolean;
}

export interface DiffData {
  changes: DiffChange[];
  original_full: string;
  revised_full: string;
}

export type SyncMode = 'all' | 'keyword' | 'selected';

export interface SyncRequest {
  mode: SyncMode;
  keyword?: string;
  source_ids?: string[];
}

export interface UserOAuthToken {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
}
