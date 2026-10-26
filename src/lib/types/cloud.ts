export type CloudJobKind = 'app_issue' | 'user_task';

export type CloudJobStatus =
  | 'queued'
  | 'provisioning'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type CloudFunding = 'user' | 'system' | 'donation_pool';

export type CloudPaymentStatus = 'pending' | 'charged' | 'shortfall' | 'free';

export interface CloudJob {
  id: string;
  kind: CloudJobKind;
  status: CloudJobStatus;
  title: string;
  prompt?: string;
  repo: string | null;
  branch: string | null;
  issue_number: number | null;
  issue_url: string | null;
  pr_url: string | null;
  codespace_url: string | null;
  funded_by: CloudFunding;
  payment_status: CloudPaymentStatus;
  credits_estimated: number;
  credits_charged: number;
  runtime_seconds: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  result_summary: string | null;
  result_detail?: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface CloudOverview {
  is_admin: boolean;
  available: boolean;
  user_balance: number;
  estimated_credits: number;
  credit_per_minute: number;
  daily_limit: number;
  daily_used: number;
  auto_enabled: boolean;
  auto_repo: string | null;
  max_concurrent: number;
  jobs: CloudJob[];
  message?: string;
}
