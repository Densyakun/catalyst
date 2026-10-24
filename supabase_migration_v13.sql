-- ============================================================
-- Migration v13: 資金・リソースの安全な共有
--   - 共有コードで特定の相手にだけ公開
--   - 金額上限・利用回数・有効期限・権限を設定
--   - 利用履歴を監査ログとして記録
-- ============================================================

-- ============================================================
-- 共有本体
-- ============================================================
CREATE TABLE IF NOT EXISTS public.resource_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    resource_id UUID REFERENCES public.user_resources(id) ON DELETE SET NULL,
    purpose_id UUID REFERENCES public.fund_purposes(id) ON DELETE SET NULL,
    shared_idea_id UUID REFERENCES public.shared_ideas(id) ON DELETE SET NULL,
    share_type TEXT NOT NULL,                 -- 'money','resource','api','mcp'
    title TEXT NOT NULL,
    description TEXT,
    amount_limit NUMERIC NOT NULL DEFAULT 0,
    amount_used NUMERIC NOT NULL DEFAULT 0,
    permissions TEXT[] DEFAULT '{read}',
    max_uses INTEGER NOT NULL DEFAULT 0,      -- 0 = 無制限
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    access_code_hash TEXT NOT NULL UNIQUE,
    access_code_prefix TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',    -- 'active','revoked','expired','exhausted'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 利用権（resource_shares のポリシーより先に作成する）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.resource_share_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID REFERENCES public.resource_shares(id) ON DELETE CASCADE NOT NULL,
    grantee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',    -- 'active','revoked','expired'
    amount_used NUMERIC NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (share_id, grantee_id)
);

-- ============================================================
-- 監査ログ
-- ============================================================
CREATE TABLE IF NOT EXISTS public.resource_share_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID REFERENCES public.resource_shares(id) ON DELETE CASCADE NOT NULL,
    grant_id UUID REFERENCES public.resource_share_grants(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,                     -- 'created','redeemed','authorized','denied','revoked'
    amount NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- RLS: resource_shares
-- ============================================================
ALTER TABLE public.resource_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage resource shares" ON public.resource_shares;
CREATE POLICY "Owners can manage resource shares" ON public.resource_shares
    FOR ALL USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Grantees can read resource shares" ON public.resource_shares;
CREATE POLICY "Grantees can read resource shares" ON public.resource_shares
    FOR SELECT USING (
        id IN (
            SELECT share_id
            FROM public.resource_share_grants
            WHERE grantee_id = auth.uid() AND status = 'active'
        )
    );

-- ============================================================
-- RLS: resource_share_grants
-- ============================================================
ALTER TABLE public.resource_share_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own or owned share grants" ON public.resource_share_grants;
CREATE POLICY "Users can read own or owned share grants" ON public.resource_share_grants
    FOR SELECT USING (
        auth.uid() = grantee_id
        OR share_id IN (SELECT id FROM public.resource_shares WHERE owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can update own share grants" ON public.resource_share_grants;
CREATE POLICY "Users can update own share grants" ON public.resource_share_grants
    FOR UPDATE USING (auth.uid() = grantee_id);

DROP POLICY IF EXISTS "Owners can update share grants" ON public.resource_share_grants;
CREATE POLICY "Owners can update share grants" ON public.resource_share_grants
    FOR UPDATE USING (
        share_id IN (SELECT id FROM public.resource_shares WHERE owner_id = auth.uid())
    );

-- ============================================================
-- RLS: resource_share_events
-- ============================================================
ALTER TABLE public.resource_share_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read relevant share events" ON public.resource_share_events;
CREATE POLICY "Users can read relevant share events" ON public.resource_share_events
    FOR SELECT USING (
        actor_id = auth.uid()
        OR share_id IN (SELECT id FROM public.resource_shares WHERE owner_id = auth.uid())
    );

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_resource_shares_owner
    ON public.resource_shares(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_shares_purpose
    ON public.resource_shares(purpose_id, status);
CREATE INDEX IF NOT EXISTS idx_resource_shares_code_hash
    ON public.resource_shares(access_code_hash);

CREATE INDEX IF NOT EXISTS idx_resource_share_grants_share
    ON public.resource_share_grants(share_id, status);
CREATE INDEX IF NOT EXISTS idx_resource_share_grants_grantee
    ON public.resource_share_grants(grantee_id, status);

CREATE INDEX IF NOT EXISTS idx_resource_share_events_share
    ON public.resource_share_events(share_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_share_events_actor
    ON public.resource_share_events(actor_id, created_at DESC);
