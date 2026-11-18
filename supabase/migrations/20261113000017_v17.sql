-- ============================================================
-- Migration v17: クラウド作業の結果詳細と進捗記録
--   - result_detail はコードから参照しているが、既存環境で
--     未作成だった場合に備えて追加する（冪等）。
--   - 進捗（stage）と途中経過の使用量は metadata に保存する。
-- ============================================================

ALTER TABLE public.cloud_jobs
    ADD COLUMN IF NOT EXISTS result_detail TEXT;

-- 実行中のジョブを started_at ではなく heartbeat_at で判定できるようにする
CREATE INDEX IF NOT EXISTS idx_cloud_jobs_status_heartbeat
    ON public.cloud_jobs(status, heartbeat_at DESC);
