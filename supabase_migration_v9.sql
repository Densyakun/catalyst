-- ============================================================
-- Migration v9: 通知の詳細表示と参照リンク
--   通知に詳細な説明 (detail) と GitHub Issue などのリンク (link_url) を持たせる。
-- ============================================================

ALTER TABLE public.user_notifications
    ADD COLUMN IF NOT EXISTS detail TEXT,
    ADD COLUMN IF NOT EXISTS link_url TEXT;
