-- ============================================================
-- Migration v8: ユーザー発行APIトークン
--   エージェント/MCPは各ユーザーが発行したトークンで認証する。
--   トークンはハッシュのみ保存し、平文は発行時に一度だけ表示する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'default',
    token_prefix TEXT NOT NULL,        -- 表示用（例: cat_ab12cd）
    token_hash TEXT NOT NULL UNIQUE,   -- sha256 hex
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_api_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own api tokens" ON public.user_api_tokens;
CREATE POLICY "Users can manage own api tokens" ON public.user_api_tokens
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_api_tokens_hash ON public.user_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user ON public.user_api_tokens(user_id);
