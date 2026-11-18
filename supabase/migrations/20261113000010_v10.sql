-- ============================================================
-- Migration v10: LLM 呼び出しログとヘルス検知
--   役割（structuring/solving）ごとの成功率・レイテンシ・
--   スキーマ検証失敗を記録し、モデル変更の必要性を自動判定する。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.llm_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    role TEXT NOT NULL,                        -- 'structuring' | 'solving'
    agent TEXT,                                -- 呼び出し元エージェント（任意）
    operation TEXT,                            -- 画面・操作の識別子（任意）
    model TEXT NOT NULL,
    base_url TEXT,
    prompt_version TEXT,
    success BOOLEAN NOT NULL,
    error_type TEXT,                           -- 'auth','rate_limit','timeout','server','schema','unknown'
    error_message TEXT,
    latency_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    finish_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.llm_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own llm calls" ON public.llm_calls;
CREATE POLICY "Users can read own llm calls" ON public.llm_calls
    FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_llm_calls_created ON public.llm_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_role_created ON public.llm_calls(role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_model_created ON public.llm_calls(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_success_created ON public.llm_calls(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_user_created ON public.llm_calls(user_id, created_at DESC);
