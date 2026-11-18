-- 既存のテーブルに user_id を追加（認証対応）
ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 診断の質問回答を保存するテーブル
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    question_id TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- クラスタリングされた共通課題（トップページ用）
CREATE TABLE IF NOT EXISTS public.clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    occurrence_count INTEGER DEFAULT 1,
    solved_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS（行レベルセキュリティ）の強化：ユーザーは自分のデータのみアクセス可能に
DROP POLICY IF EXISTS "Allow public select" ON public.problems;
DROP POLICY IF EXISTS "Allow public insert" ON public.problems;
CREATE POLICY "Users can see only their own problems" ON public.problems FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own problems" ON public.problems FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow public select" ON public.actions;
DROP POLICY IF EXISTS "Allow public insert" ON public.actions;
CREATE POLICY "Users can see only their own actions" ON public.actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own actions" ON public.actions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- クラスタ（共通課題）は全員が見れる
CREATE POLICY "Everyone can see clusters" ON public.clusters FOR SELECT USING (true);
