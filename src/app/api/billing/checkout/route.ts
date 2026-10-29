import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { findPack, getBillingConfig } from '@/lib/billing/config';
import { createStripeCheckoutSession } from '@/lib/billing/stripe';

export const dynamic = 'force-dynamic';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * POST /api/billing/checkout
 * クレジットを Stripe Checkout で購入する。
 * 目的（purpose_id）は任意で、指定した場合は本人所有の有効な目的だけを許可する。
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = getBillingConfig();
    if (!config.available) {
      return NextResponse.json(
        { error: '決済は現在準備中です。時間をおいて再度お試しください。' },
        { status: 503 },
      );
    }
    if (config.currency !== 'jpy') {
      return NextResponse.json({ error: '現在は円建てのみ対応しています。' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const packId = typeof body?.pack_id === 'string' ? body.pack_id.trim() : '';
    const pack = findPack(config, packId);
    if (!pack) {
      return NextResponse.json({ error: '購入するプランを選択してください。' }, { status: 400 });
    }

    const purposeId = typeof body?.purpose_id === 'string' ? body.purpose_id.trim() : '';
    if (purposeId) {
      const { data: purpose } = await supabase
        .from('fund_purposes')
        .select('id, owner_id, status')
        .eq('id', purposeId)
        .maybeSingle();
      if (!purpose || purpose.owner_id !== user.id) {
        return NextResponse.json({ error: '目的が見つかりません。' }, { status: 404 });
      }
      if (String(purpose.status) !== 'active') {
        return NextResponse.json({ error: 'この目的は現在利用できません。' }, { status: 400 });
      }
    }

    const origin = req.nextUrl.origin;
    if (!isHttpUrl(origin)) {
      return NextResponse.json({ error: '決済の戻り先URLを特定できませんでした。' }, { status: 500 });
    }

    const admin = createAdminClient();
    const { data: payment, error: insertError } = await admin
      .from('payments')
      .insert({
        user_id: user.id,
        purpose_id: purposeId || null,
        pack_id: pack.id,
        amount: pack.amountJpy,
        currency: config.currency,
        credits: pack.credits,
        status: 'pending',
        metadata: { pack_label: pack.label },
      })
      .select('id')
      .single();
    if (insertError || !payment) {
      throw insertError ?? new Error('決済の準備に失敗しました。');
    }

    try {
      const session = await createStripeCheckoutSession(config.secretKey, {
        amountJpy: pack.amountJpy,
        currency: config.currency,
        productName: `Katalyse ${pack.label}（${pack.credits.toLocaleString('ja-JP')}クレジット）`,
        successUrl: `${origin}/?tab=funds&payment=success`,
        cancelUrl: `${origin}/?tab=funds&payment=cancel`,
        clientReferenceId: user.id,
        customerEmail: user.email || undefined,
        metadata: {
          payment_id: String(payment.id),
          user_id: user.id,
          purpose_id: purposeId,
          pack_id: pack.id,
          credits: String(pack.credits),
          amount_jpy: String(pack.amountJpy),
        },
        idempotencyKey: `checkout-${payment.id}`,
      });

      const { error: updateError } = await admin
        .from('payments')
        .update({
          provider_session_id: session.id,
          provider_payment_intent: session.paymentIntent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);
      if (updateError) throw updateError;

      return NextResponse.json({ url: session.url });
    } catch (error) {
      await admin
        .from('payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', payment.id)
        .eq('status', 'pending');
      throw error;
    }
  } catch (error: unknown) {
    console.error('Billing checkout error:', error);
    return NextResponse.json(
      { error: '決済を開始できませんでした。時間をおいて再度お試しください。' },
      { status: 502 },
    );
  }
}
