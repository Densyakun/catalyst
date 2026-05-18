-- 診断セッション管理テーブル追加
CREATE TABLE IF NOT EXISTS public.diagnostic_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    answers JSONB DEFAULT '[]'::jsonb,
    current_question JSONB,
    is_completed BOOLEAN DEFAULT false,
    context TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 回答詳細ログテーブル（answersテーブルを拡張）
ALTER TABLE public.answers 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.diagnostic_sessions(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS step_number INTEGER DEFAULT 1;

-- problemsテーブルに優先度関連カラム追加
ALTER TABLE public.problems 
ADD COLUMN IF NOT EXISTS personal_priority DECIMAL,
ADD COLUMN IF NOT EXISTS social_impact DECIMAL,
ADD COLUMN IF NOT EXISTS priority_score DECIMAL,
ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES public.clusters(id) ON DELETE SET NULL;

-- 診断セッションのRLSポリシー
CREATE POLICY "Users can see own diagnostic sessions" ON public.diagnostic_sessions 
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own diagnostic sessions" ON public.diagnostic_sessions 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own diagnostic sessions" ON public.diagnostic_sessions 
    FOR UPDATE USING (auth.uid() = user_id);

-- 回答ログのRLSポリシー
CREATE POLICY "Users can see own answers" ON public.answers 
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own answers" ON public.answers 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- problemsの優先度関連カラムへのRLS
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can see only their own problems" ON public.problems;
DROP POLICY IF EXISTS "Users can insert their own problems" ON public.problems;
CREATE POLICY "Users can manage own problems" ON public.problems 
    FOR ALL USING (auth.uid() = user_id);