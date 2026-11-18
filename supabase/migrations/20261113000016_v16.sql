-- ============================================================
-- Migration v16: クラウド作業環境の再利用セッション
--   - 1つの Codespace を複数ジョブで使い回す
--   - ランナーの生存確認とアイドル停止を管理する
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cloud_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codespace_name TEXT NOT NULL UNIQUE,
    codespace_url TEXT,
    status TEXT NOT NULL DEFAULT 'starting', -- 'starting','idle','busy','review','stopping','stopped','failed'
    current_job_id UUID REFERENCES public.cloud_jobs(id) ON DELETE SET NULL,
    runner_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    stopped_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cloud_sessions_status_seen
    ON public.cloud_sessions(status, runner_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_sessions_current_job
    ON public.cloud_sessions(current_job_id);

ALTER TABLE public.cloud_sessions ENABLE ROW LEVEL SECURITY;
