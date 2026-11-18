-- ============================================================
-- Migration v6: 自己進化エンジン
--   ユーザーの不満・欲求・興味と操作データを収集し、
--   AIがアプリ自体の改善提案を生成、UIバリアントを安全に評価する。
-- ============================================================

-- 明示的フィードバック（不満・欲求・興味・バグ・称賛）
CREATE TABLE IF NOT EXISTS public.user_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'other',   -- 'dissatisfaction','desire','interest','bug','praise','other'
    rating INTEGER,                            -- 1-5（任意）
    message TEXT,
    context_path TEXT,                         -- 送信時の画面パス
    context_feature TEXT,                      -- 対象機能
    sentiment TEXT,                            -- 'negative','neutral','positive'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 自己進化の改善提案（アプリ自体の改善）
CREATE TABLE IF NOT EXISTS public.evolution_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = 全ユーザー横断
    title TEXT NOT NULL,
    category TEXT NOT NULL,                    -- 'feature','ux','bug','performance','content'
    rationale TEXT NOT NULL,
    target_area TEXT,                          -- 対象画面・機能
    proposed_change TEXT,                      -- 具体的な変更案
    priority NUMERIC DEFAULT 0.5,              -- 0-1
    evidence JSONB DEFAULT '[]'::jsonb,        -- 根拠（シグナルの抜粋）
    signals JSONB DEFAULT '{}'::jsonb,         -- 集計統計スナップショット
    status TEXT DEFAULT 'proposed',            -- 'proposed','approved','in_progress','implemented','rejected'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 動的UIバリアント（tsx-safe-eval で評価する UI 定義）
CREATE TABLE IF NOT EXISTS public.ui_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = 全ユーザー共通
    name TEXT NOT NULL,
    area TEXT NOT NULL,                        -- ダッシュボード内の領域キー
    description TEXT,
    code TEXT NOT NULL,                        -- AIが生成したTSX
    ast JSONB,                                 -- compileSourceFileToJSON の結果
    status TEXT DEFAULT 'proposed',            -- 'proposed','active','archived'
    performance JSONB DEFAULT '{}'::jsonb,     -- { impressions, clicks, dwell_ms, score }
    source_proposal_id UUID REFERENCES public.evolution_proposals(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own feedback" ON public.user_feedback;
CREATE POLICY "Users can manage own feedback" ON public.user_feedback
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read evolution proposals" ON public.evolution_proposals;
CREATE POLICY "Users can read evolution proposals" ON public.evolution_proposals
    FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own evolution proposals" ON public.evolution_proposals;
CREATE POLICY "Users can manage own evolution proposals" ON public.evolution_proposals
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read active ui variants" ON public.ui_variants;
CREATE POLICY "Anyone can read active ui variants" ON public.ui_variants
    FOR SELECT USING (status = 'active' OR user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own ui variants" ON public.ui_variants;
CREATE POLICY "Users can manage own ui variants" ON public.ui_variants
    FOR ALL USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_created ON public.user_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_proposals_status ON public.evolution_proposals(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_ui_variants_area_status ON public.ui_variants(area, status);
