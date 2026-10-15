-- ============================================================
-- Migration v7: エージェント連携（GitHub Issue/PR との双方向同期）
--   - 改善提案に GitHub の Issue/PR 情報を保持
--   - エージェントの結果をユーザーへ報告する通知テーブル
-- ============================================================

-- 提案に外部(GitHub)連携用のカラムを追加
ALTER TABLE public.evolution_proposals
    ADD COLUMN IF NOT EXISTS github_repo TEXT,
    ADD COLUMN IF NOT EXISTS github_issue_number INTEGER,
    ADD COLUMN IF NOT EXISTS github_issue_url TEXT,
    ADD COLUMN IF NOT EXISTS github_pr_url TEXT,
    ADD COLUMN IF NOT EXISTS external_state TEXT,     -- GitHub側の状態（open/merged/closed等）
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- ユーザーへの報告通知（エージェント→Catalyst）
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    proposal_id UUID REFERENCES public.evolution_proposals(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT,
    kind TEXT DEFAULT 'improvement',   -- 'improvement', 'info', 'error'
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own notifications" ON public.user_notifications;
CREATE POLICY "Users can manage own notifications" ON public.user_notifications
    FOR ALL USING (auth.uid() = user_id);

-- エージェントAPI（service_role）はRLSをバイパスするため追加ポリシー不要

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created ON public.user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON public.user_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_evolution_proposals_github ON public.evolution_proposals(github_repo, github_issue_number);
