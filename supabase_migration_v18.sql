-- ============================================================
-- Migration v18: Stripe 決済とクレジット購入
--   - ユーザーごとの購入履歴（任意で目的に紐付け）
--   - Webhook の二重処理防止
--   - 決済1件に対するクレジット付与・返金をトランザクションで行う
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- 目的は任意（すべてのユーザーが目的を持つわけではない）
    purpose_id UUID REFERENCES public.fund_purposes(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'stripe',
    provider_session_id TEXT UNIQUE,
    provider_payment_intent TEXT,
    pack_id TEXT,
    amount NUMERIC NOT NULL DEFAULT 0,       -- 決済通貨の金額（JPY は整数）
    currency TEXT NOT NULL DEFAULT 'jpy',
    credits NUMERIC NOT NULL DEFAULT 0,      -- 付与するクレジット
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'succeeded' | 'failed' | 'refunded'
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user_created
    ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_purpose_created
    ON public.payments(purpose_id, created_at DESC)
    WHERE purpose_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_payment_intent
    ON public.payments(provider_payment_intent)
    WHERE provider_payment_intent IS NOT NULL;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own payments" ON public.payments;
CREATE POLICY "Users can read own payments" ON public.payments
    FOR SELECT USING (auth.uid() = user_id);

-- Webhook の event.id で二重処理を防ぐ（補助的な記録）
CREATE TABLE IF NOT EXISTS public.stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- 決済1件のクレジット付与。二重呼び出しでも1回だけ反映する。
CREATE OR REPLACE FUNCTION public.apply_payment_credits(
    p_payment_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    payment public.payments;
BEGIN
    SELECT * INTO payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    IF payment.status <> 'pending' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.payments
    SET status = 'succeeded',
        paid_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = payment.id;

    INSERT INTO public.user_balance (user_id, balance, total_deposited)
    VALUES (payment.user_id, GREATEST(0, payment.credits), GREATEST(0, payment.amount))
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_balance.balance + EXCLUDED.balance,
        total_deposited = public.user_balance.total_deposited + EXCLUDED.total_deposited,
        updated_at = timezone('utc'::text, now());

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_payment_credits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_payment_credits(UUID) TO service_role;

-- 返金。成功済みの決済だけを対象にし、残高は 0 未満にしない。
CREATE OR REPLACE FUNCTION public.refund_payment_credits(
    p_payment_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    payment public.payments;
BEGIN
    SELECT * INTO payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND OR payment.status <> 'succeeded' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.payments
    SET status = 'refunded',
        refunded_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = payment.id;

    UPDATE public.user_balance
    SET balance = GREATEST(0, balance - GREATEST(0, payment.credits)),
        updated_at = timezone('utc'::text, now())
    WHERE user_id = payment.user_id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_payment_credits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_payment_credits(UUID) TO service_role;
