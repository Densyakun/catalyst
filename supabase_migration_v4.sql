-- ============================================================
-- Migration v4: ユーザー外部ソース連携 & 自動インサイト
-- ============================================================

-- 外部ソース管理テーブル（Google Docs等）
CREATE TABLE IF NOT EXISTS public.user_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    source_type TEXT NOT NULL,             -- 'google_docs'
    source_name TEXT NOT NULL,             -- 表示名
    source_config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- docId, tokens等
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ドキュメントスナップショット
CREATE TABLE IF NOT EXISTS public.source_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES public.user_sources(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,                 -- 取得したテキスト
    summary TEXT,                          -- AI要約
    extracted_intents JSONB,               -- 抽出された意図・課題
    content_hash TEXT,                     -- 変更検出用ハッシュ
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 自動インサイト
CREATE TABLE IF NOT EXISTS public.auto_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    source_snapshot_id UUID REFERENCES public.source_snapshots(id) ON DELETE SET NULL,
    insight_type TEXT NOT NULL,            -- 'detected_problem', 'suggestion', 'memo_rewrite'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    proposed_action JSONB,                 -- 提案アクション
    estimated_cost JSONB,                  -- { time: string, money: number }
    auto_proceed BOOLEAN DEFAULT false,    -- コストが低い場合は自動実行
    status TEXT DEFAULT 'pending',         -- 'pending', 'in_progress', 'completed', 'on_hold'
    diff_data JSONB,                       -- メモ書き換え時の差分データ
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Google OAuthトークン管理
CREATE TABLE IF NOT EXISTS public.user_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    provider TEXT NOT NULL,                -- 'google'
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scopes TEXT[],
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, provider)
);

-- RLS
ALTER TABLE public.user_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sources" ON public.user_sources
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own snapshots" ON public.source_snapshots
    FOR ALL USING (
        source_id IN (SELECT id FROM public.user_sources WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can manage own insights" ON public.auto_insights
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own oauth tokens" ON public.user_oauth_tokens
    FOR ALL USING (auth.uid() = user_id);

-- ユーザー活動テーブル（既に存在する場合はスキップ）
CREATE TABLE IF NOT EXISTS public.user_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    activity_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own activity" ON public.user_activity
    FOR ALL USING (auth.uid() = user_id);

-- clustersテーブルに problem_count, dynamic_ui カラムを追加（v3で漏れた場合用）
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS problem_count INTEGER DEFAULT 0;
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS dynamic_ui JSONB;
