-- ============================================================
-- Migration v12: 時間指定処理・目的別資金・共有アイデア
--   - アイデアの処理予定日時
--   - 目的別の寄付・資金台帳
--   - 他ユーザーのアイデアへの資金/時間/スキル支援
-- ============================================================

-- ============================================================
-- アイデア処理の予約
-- ============================================================
ALTER TABLE public.idea_inbox
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

UPDATE public.idea_inbox
    SET scheduled_at = created_at
    WHERE scheduled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_idea_inbox_schedule
    ON public.idea_inbox(user_id, status, scheduled_at);

-- ============================================================
-- 目的別の資金
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fund_purposes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    target_amount NUMERIC NOT NULL DEFAULT 0,
    balance NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',   -- 'active','completed','paused'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.fund_purposes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read fund purposes" ON public.fund_purposes;
CREATE POLICY "Authenticated users can read fund purposes" ON public.fund_purposes
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Owners can manage fund purposes" ON public.fund_purposes;
CREATE POLICY "Owners can manage fund purposes" ON public.fund_purposes
    FOR ALL USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_fund_purposes_owner ON public.fund_purposes(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_fund_purposes_category ON public.fund_purposes(category, status);

-- 寄付の目的・メッセージ
ALTER TABLE public.donations
    ADD COLUMN IF NOT EXISTS purpose_id UUID REFERENCES public.fund_purposes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS message TEXT;

-- ============================================================
-- 資金台帳
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fund_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose_id UUID REFERENCES public.fund_purposes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,                     -- 'donation','spend','refund','allocation'
    amount NUMERIC NOT NULL DEFAULT 0,
    related_shared_idea_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.fund_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read relevant fund transactions" ON public.fund_transactions;
CREATE POLICY "Users can read relevant fund transactions" ON public.fund_transactions
    FOR SELECT USING (
        auth.uid() = user_id
        OR purpose_id IN (SELECT id FROM public.fund_purposes WHERE owner_id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_fund_transactions_purpose_created
    ON public.fund_transactions(purpose_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fund_transactions_user_created
    ON public.fund_transactions(user_id, created_at DESC);

-- ============================================================
-- 共有アイデア（他ユーザーが支援できる）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shared_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    insight_id UUID REFERENCES public.auto_insights(id) ON DELETE SET NULL,
    purpose_id UUID REFERENCES public.fund_purposes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT,
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    needed_support TEXT[] DEFAULT '{money,time,skill}',
    target_amount NUMERIC NOT NULL DEFAULT 0,
    funded_amount NUMERIC NOT NULL DEFAULT 0,
    supporter_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',    -- 'open','in_progress','completed','closed'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shared_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read shared ideas" ON public.shared_ideas;
CREATE POLICY "Authenticated users can read shared ideas" ON public.shared_ideas
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Owners can manage shared ideas" ON public.shared_ideas;
CREATE POLICY "Owners can manage shared ideas" ON public.shared_ideas
    FOR ALL USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_shared_ideas_status_created
    ON public.shared_ideas(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_ideas_owner
    ON public.shared_ideas(owner_id, created_at DESC);

-- ============================================================
-- 共有アイデアへの支援
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shared_idea_supporters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_idea_id UUID REFERENCES public.shared_ideas(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    support_type TEXT NOT NULL,             -- 'money','time','skill'
    amount NUMERIC,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'offered', -- 'offered','accepted','completed','declined'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shared_idea_supporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own or owned idea supporters" ON public.shared_idea_supporters;
CREATE POLICY "Users can read own or owned idea supporters" ON public.shared_idea_supporters
    FOR SELECT USING (
        auth.uid() = user_id
        OR shared_idea_id IN (SELECT id FROM public.shared_ideas WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can create own supporters" ON public.shared_idea_supporters;
CREATE POLICY "Users can create own supporters" ON public.shared_idea_supporters
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own supporters" ON public.shared_idea_supporters;
CREATE POLICY "Users can update own supporters" ON public.shared_idea_supporters
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can update idea supporters" ON public.shared_idea_supporters;
CREATE POLICY "Owners can update idea supporters" ON public.shared_idea_supporters
    FOR UPDATE USING (
        shared_idea_id IN (SELECT id FROM public.shared_ideas WHERE owner_id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_shared_idea_supporters_idea
    ON public.shared_idea_supporters(shared_idea_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_idea_supporters_user
    ON public.shared_idea_supporters(user_id, created_at DESC);
