-- ============================================================
-- Migration v11: アイデアの一時保存キュー（後でAI処理）
--   LLM が使えない時でもユーザーがアイデアを保存でき、
--   LLM 復旧後に自動で構造化・インサイト化する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.idea_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',      -- 'manual','llm_failed','agent'
    status TEXT NOT NULL DEFAULT 'pending',     -- 'pending','processing','processed','failed','cancelled'
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    last_error TEXT,
    processed_insight_id UUID REFERENCES public.auto_insights(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.idea_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own idea inbox" ON public.idea_inbox;
CREATE POLICY "Users can manage own idea inbox" ON public.idea_inbox
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_idea_inbox_user_status
    ON public.idea_inbox(user_id, status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_idea_inbox_created
    ON public.idea_inbox(created_at DESC);
