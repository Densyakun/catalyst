import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { notifyUser } from '@/lib/notifications';

function parseAmount(value: unknown): number | null {
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

/**
 * POST /api/funds/donate
 * 目的資金への寄付を記録し、目的残高・全体プール・共有アイデアへ反映する。
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      purpose_id?: unknown;
      amount?: unknown;
      message?: unknown;
    };
    const purposeId = typeof body.purpose_id === 'string' ? body.purpose_id : '';
    const amount = parseAmount(body.amount);
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : null;

    if (!purposeId) {
      return NextResponse.json({ error: '目的を選択してください' }, { status: 400 });
    }
    if (amount == null) {
      return NextResponse.json({ error: '金額が不正です' }, { status: 400 });
    }

    const { data: purpose } = await supabase
      .from('fund_purposes')
      .select('*')
      .eq('id', purposeId)
      .maybeSingle();

    if (!purpose) {
      return NextResponse.json({ error: '目的が見つかりません' }, { status: 404 });
    }
    if (purpose.status !== 'active') {
      return NextResponse.json({ error: 'この目的は現在受付していません' }, { status: 400 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error: donationError } = await admin.from('donations').insert({
      user_id: user.id,
      amount,
      purpose_id: purposeId,
      message,
    });
    if (donationError) throw donationError;

    await admin
      .from('fund_purposes')
      .update({
        balance: Number(purpose.balance) + amount,
        updated_at: now,
      })
      .eq('id', purposeId);

    const { data: pool } = await admin
      .from('donation_pool')
      .select('id, balance, total_donated')
      .limit(1)
      .maybeSingle();

    if (pool) {
      await admin
        .from('donation_pool')
        .update({
          balance: Number(pool.balance) + amount,
          total_donated: Number(pool.total_donated) + amount,
          updated_at: now,
        })
        .eq('id', pool.id);
    }

    await admin.from('fund_transactions').insert({
      purpose_id: purposeId,
      user_id: user.id,
      type: 'donation',
      amount,
      note: message,
    });

    const { data: linkedIdeas } = await admin
      .from('shared_ideas')
      .select('id, owner_id, funded_amount, target_amount, status')
      .eq('purpose_id', purposeId);

    const notified = new Set<string>();
    for (const idea of linkedIdeas || []) {
      const funded = Number(idea.funded_amount) + amount;
      const reached = Number(idea.target_amount) > 0 && funded >= Number(idea.target_amount);
      await admin
        .from('shared_ideas')
        .update({
          funded_amount: funded,
          status: reached && idea.status === 'open' ? 'in_progress' : idea.status,
          updated_at: now,
        })
        .eq('id', idea.id);

      if (idea.owner_id !== user.id && !notified.has(idea.owner_id)) {
        notified.add(idea.owner_id);
        await notifyUser(admin, {
          userId: idea.owner_id,
          title: '共有アイデアに資金支援がありました',
          body: `¥${amount.toLocaleString()} の支援が届きました。`,
          detail: message,
          kind: 'info',
        });
      }
    }

    if (purpose.owner_id && purpose.owner_id !== user.id && !notified.has(purpose.owner_id)) {
      await notifyUser(admin, {
        userId: purpose.owner_id,
        title: '目的資金に寄付がありました',
        body: `「${purpose.name}」に ¥${amount.toLocaleString()} の寄付がありました。`,
        detail: message,
        kind: 'info',
      });
    }

    return NextResponse.json({
      success: true,
      purpose_balance: Number(purpose.balance) + amount,
      pool_balance: Number(pool?.balance || 0) + amount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Donation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
