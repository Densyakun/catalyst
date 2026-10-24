export type IdeaInboxStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'cancelled';
export type IdeaInboxSource = 'manual' | 'llm_failed' | 'agent';

export interface IdeaInboxItem {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  source: IdeaInboxSource;
  status: IdeaInboxStatus;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  scheduled_at: string | null;
  last_error: string | null;
  processed_insight_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProcessIdeaInboxResult {
  processed: number;
  failed: number;
  skipped: number;
  remaining: number;
  errors: string[];
}
