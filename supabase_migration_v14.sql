-- ============================================================
-- Migration v14: クラウド実行ジョブ（自動改善 + ユーザー依頼）
--   - アプリの課題をクラウド作業環境で自動解決するジョブ
--   - ユーザーが任意の作業を依頼できるクラウドジョブ
--   - 実行時間とトークン消費量からクレジットを計算して記録
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cloud_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,                        -- 'app_issue' | 'user_task'
    status TEXT NOT NULL DEFAULT 'queued',     -- 'queued','provisioning','running','succeeded','failed','blocked','cancelled','timed_out'
    source TEXT NOT NULL DEFAULT 'user',       -- 'github' | 'user'
    source_ref TEXT,                           -- 例: 'owner/repo#123'
    dedupe_key TEXT,                           -- 同じ課題を二重に実行しないためのキー
    priority INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    repo TEXT,
    branch TEXT,
    issue_number INTEGER,
    issue_url TEXT,
    codespace_name TEXT,
    codespace_url TEXT,
    machine TEXT,
    model TEXT,
    max_minutes INTEGER NOT NULL DEFAULT 30,
    funded_by TEXT NOT NULL DEFAULT 'user',    -- 'user' | 'system' | 'donation_pool'
    payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending','charged','shortfall','free'
    credits_estimated NUMERIC NOT NULL DEFAULT 0,
    credits_charged NUMERIC NOT NULL DEFAULT 0,
    runtime_seconds INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC NOT NULL DEFAULT 0,
    result_summary TEXT,
    result_detail TEXT,
    pr_url TEXT,
    error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    started_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

-- 同一の GitHub Issue を実行中・完了済みの間はジョブ化しない
-- （失敗・キャンセル・時間切れの場合は再実行できるようインデックス対象から外す）
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_jobs_dedupe
    ON public.cloud_jobs(dedupe_key)
    WHERE dedupe_key IS NOT NULL
      AND status IN ('queued', 'provisioning', 'running', 'succeeded', 'blocked', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_cloud_jobs_status_created
    ON public.cloud_jobs(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_cloud_jobs_user_created
    ON public.cloud_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_jobs_codespace
    ON public.cloud_jobs(codespace_name);

-- ============================================================
-- RLS: 本人のジョブだけ直接参照できる。
-- システムジョブ（user_id IS NULL）は API のサービスロールのみ扱う。
-- ============================================================
ALTER TABLE public.cloud_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own cloud jobs" ON public.cloud_jobs;
CREATE POLICY "Users can read own cloud jobs" ON public.cloud_jobs
    FOR SELECT USING (auth.uid() = user_id);
