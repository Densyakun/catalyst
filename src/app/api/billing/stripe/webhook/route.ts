import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import { getBillingConfig } from '@/lib/billing/config';
import { verifyStripeSignature } from '@/lib/billing/stripe';

export const dynamic = 'force-dynamic';

type StripeObject = Record<string, unknown>;

interface StripeEvent {
  id?: unknown;
  type?: unknown;
  data?: { object?: StripeObject };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function positiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function metadataOf(object: StripeObject): Record<string, unknown> {
  const metadata = object.metadata;
  return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
}

async function findOrCreatePayment(
  admin: SupabaseClient,
  session: StripeObject,
): Promise<{ id: string } | null> {
  const sessionId = str(session.id);
  if (!sessionId) return null;

  const { data: existing } = await admin
    .from('payments')
    .select('id')
    .eq('provider_session_id', sessionId)
    .maybeSingle();
  if (existing) return existing as { id: string };

  const metadata = metadataOf(session);
  const paymentId = str(metadata.payment_id);
  if (paymentId) {
    const { data: byId } = await admin
      .from('payments')
      .select('id')
      .eq('id', paymentId)
      .maybeSingle();
    if (byId) {
      await admin
        .from('payments')
        .update({
          provider_session_id: sessionId,
          provider_payment_intent: str(session.payment_intent) || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
      return byId as { id: string };
    }
  }

  // アプリ外（Stripe ダッシュボード等）で作成された決済のフォールバック。
  // metadata が揃っている場合だけ記録する。
  const userId = str(metadata.user_id);
  const credits = positiveNumber(metadata.credits);
  if (!userId || !credits) return null;

  const purposeId = str(metadata.purpose_id);
  const base = {
    user_id: userId,
    pack_id: str(metadata.pack_id) || null,
    amount: positiveNumber(metadata.amount_jpy),
    currency: 'jpy',
    credits,
    status: 'pending',
    provider_session_id: sessionId,
    provider_payment_intent: str(session.payment_intent) || null,
    metadata: { source: 'webhook' },
  };

  let { data, error } = await admin
    .from('payments')
    .insert({ ...base, purpose_id: purposeId || null })
    .select('id')
    .single();
  if (error && purposeId) {
    // 目的が削除済みでも決済自体は記録する。
    ({ data, error } = await admin.from('payments').insert(base).select('id').single());
  }
  if (error) {
    const { data: again } = await admin
      .from('payments')
      .select('id')
      .eq('provider_session_id', sessionId)
      .maybeSingle();
    return (again as { id: string } | null) ?? null;
  }
  return data as { id: string };
}

async function markFailed(admin: SupabaseClient, sessionId: string): Promise<void> {
  if (!sessionId) return;
  await admin
    .from('payments')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('provider_session_id', sessionId)
    .eq('status', 'pending');
}

export async function POST(req: NextRequest) {
  const config = getBillingConfig();
  if (!config.webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  const valid = await verifyStripeSignature(
    rawBody,
    req.headers.get('stripe-signature'),
    config.webhookSecret,
  ).catch(() => false);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const eventId = str(event.id);
  const eventType = str(event.type);
  const object = (event.data?.object || {}) as StripeObject;
  const admin = createAdminClient();

  try {
    switch (eventType) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (str(object.payment_status) !== 'paid') {
          // 非同期決済は async_payment_succeeded を待つ。
          return NextResponse.json({ received: true, pending: true });
        }
        const payment = await findOrCreatePayment(admin, object);
        if (!payment) {
          console.error('Stripe payment not found for session', str(object.id));
          return NextResponse.json({ received: true, ignored: true });
        }
        const { error } = await admin.rpc('apply_payment_credits', {
          p_payment_id: payment.id,
        });
        if (error) {
          console.error('Applying payment credits failed:', error);
          return NextResponse.json({ error: 'Credit grant failed' }, { status: 500 });
        }
        break;
      }
      case 'checkout.session.expired': {
        await markFailed(admin, str(object.id));
        break;
      }
      case 'charge.refunded': {
        const paymentIntent = str(object.payment_intent);
        let paymentId = '';
        if (paymentIntent) {
          const { data } = await admin
            .from('payments')
            .select('id')
            .eq('provider_payment_intent', paymentIntent)
            .maybeSingle();
          paymentId = data?.id ? String(data.id) : '';
        }
        if (!paymentId) {
          paymentId = str(metadataOf(object).payment_id);
        }
        if (paymentId) {
          const { error } = await admin.rpc('refund_payment_credits', {
            p_payment_id: paymentId,
          });
          if (error) {
            console.error('Refunding payment credits failed:', error);
            return NextResponse.json({ error: 'Refund failed' }, { status: 500 });
          }
        }
        break;
      }
      default:
        return NextResponse.json({ received: true, ignored: true });
    }

    if (eventId) {
      const { error } = await admin.from('stripe_events').insert({
        id: eventId,
        type: eventType || 'unknown',
      });
      if (error && error.code !== '23505') {
        console.error('Recording stripe event failed:', error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
