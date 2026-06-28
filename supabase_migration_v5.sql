-- ============================================================
-- Migration v5: 課題解決エンジン - チャット・リソース・目星・プロジェクト・コスト
-- ============================================================

-- チャット（情報収集窓口）
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    title TEXT,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    extracted_tags JSONB DEFAULT '[]'::jsonb,    -- AIが自動付与したタグ
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ユーザーリソース管理
CREATE TABLE IF NOT EXISTS public.user_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    resource_type TEXT NOT NULL,             -- 'time', 'money', 'skill', 'tool', 'connection'
    name TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,      -- 型固有のデータ（予算額、空き時間等）
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 目星（情報選択・フィルタリング）
CREATE TABLE IF NOT EXISTS public.marked_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    item_type TEXT NOT NULL,                 -- 'problem', 'resource', 'intent', 'insight'
    item_id UUID NOT NULL,
    relevance_score NUMERIC DEFAULT 0,
    scoring_cost NUMERIC DEFAULT 0,          -- 目星判定にかかったコスト
    layer INTEGER DEFAULT 0,                 -- どのLayerでマークされたか
    context TEXT,                            -- なぜマークしたか
    marked_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- プロジェクト（大規模課題のコンテナ）
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    insight_id UUID REFERENCES public.auto_insights(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    total_estimated_cost NUMERIC DEFAULT 0,
    total_actual_cost NUMERIC DEFAULT 0,
    is_social BOOLEAN DEFAULT false,
    estimated_beneficiaries INTEGER,
    status TEXT DEFAULT 'planning',          -- 'planning', 'in_progress', 'completed', 'on_hold'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- プロジェクトタスク
CREATE TABLE IF NOT EXISTS public.project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    estimated_cost NUMERIC DEFAULT 0,
    actual_cost NUMERIC DEFAULT 0,
    execution_type TEXT DEFAULT 'auto',      -- 'auto', 'user', 'hybrid'
    depends_on UUID[] DEFAULT '{}',
    input_data JSONB,
    output_data JSONB,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',           -- 'pending', 'ready', 'in_progress', 'completed', 'blocked'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- コストログ（全操作の実コストを記録）
CREATE TABLE IF NOT EXISTS public.cost_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    operation_type TEXT NOT NULL,            -- 'marking', 'scoring', 'idea_generation', 'task_execution', 'decomposition'
    layer INTEGER DEFAULT 0,
    input_item_ids UUID[] DEFAULT '{}',
    actual_cost NUMERIC NOT NULL DEFAULT 0,
    is_social BOOLEAN DEFAULT false,
    funded_by TEXT DEFAULT 'user',           -- 'user', 'donation_pool'
    estimated_beneficiaries INTEGER,
    actual_beneficiaries INTEGER,
    estimated_user_share NUMERIC,
    actual_user_share NUMERIC,
    related_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    related_task_id UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 寄付プール
CREATE TABLE IF NOT EXISTS public.donation_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance NUMERIC DEFAULT 0,
    total_donated NUMERIC DEFAULT 0,
    total_spent NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 初期プールレコード
INSERT INTO public.donation_pool (balance, total_donated, total_spent)
SELECT 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.donation_pool);

-- 寄付履歴
CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    amount NUMERIC NOT NULL,
    related_insight_id UUID REFERENCES public.auto_insights(id) ON DELETE SET NULL,
    related_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ユーザー残高
CREATE TABLE IF NOT EXISTS public.user_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
    balance NUMERIC DEFAULT 0,
    total_charged NUMERIC DEFAULT 0,
    total_deposited NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- カテゴリ別受益者数統計
CREATE TABLE IF NOT EXISTS public.beneficiary_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    avg_beneficiaries NUMERIC DEFAULT 100,
    median_beneficiaries NUMERIC DEFAULT 100,
    sample_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiary_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conversations" ON public.conversations
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own resources" ON public.user_resources
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own marked items" ON public.marked_items
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own projects" ON public.projects
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view project tasks" ON public.project_tasks
    FOR ALL USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can view own cost log" ON public.cost_log
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own donations" ON public.donations
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own balance" ON public.user_balance
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read donation pool" ON public.donation_pool
    FOR SELECT USING (true);

CREATE POLICY "Anyone can read beneficiary stats" ON public.beneficiary_stats
    FOR SELECT USING (true);
