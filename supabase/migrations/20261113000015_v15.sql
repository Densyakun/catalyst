-- ============================================================
-- Migration v15: 安全確認待ち（blocked）も重複実行防止の対象にする
-- ============================================================

DROP INDEX IF EXISTS public.idx_cloud_jobs_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_jobs_dedupe
    ON public.cloud_jobs(dedupe_key)
    WHERE dedupe_key IS NOT NULL
      AND status IN ('queued', 'provisioning', 'running', 'succeeded', 'blocked', 'cancelled');
