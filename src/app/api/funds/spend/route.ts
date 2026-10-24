import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

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
 * POST /api/funds/spend
 * 目的資金から支出を記録する（目的の所有者のみ）。
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
      note?: unknown;
      related_shared_idea_id?: unknown;
    };
    const purposeId = typeof body.purpose_id === 'string' ? body.purpose_id : '';
    const amount = parseAmount(body.amount);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : null;

    if (!purposeId) {
      return NextResponse.json({ error: '目的を選択してください' }, { status: 400 });
    }
    if (amount == null) {
      return NextResponse.json({ error: '金額が不正です' }, { status: 400 });
    }

    const { data: purpose } = await supabase
      .from('fund_purposes')
      .select('id, owner_id, balance, status')
      .eq('id', purposeId)
      .maybeSingle();

    if (!purpose) {
      return NextResponse.json({ error: '目的が見つかりません' }, { status: 404 });
    }
    if (purpose.owner_id !== user.id) {
      return NextResponse.json({ error: 'この目的の支出権限がありません' }, { status: 403 });
    }
    if (Number(purpose.balance) < amount) {
      return NextResponse.json({ error: '残高が不足しています' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 共有に割り当て済みの資金は、目的の所有者でも自由には支出できない
    const { data: activeShares } = await admin
      .from('resource_shares')
      .select('amount_limit, amount_used')
      .eq('purpose_id', purposeId)
      .eq('share_type', 'money')
      .eq('status', 'active');

    const reserved = (activeShares || []).reduce(
      (sum, share) => sum + Math.max(0, Number(share.amount_limit) - Number(share.amount_used)),
      0,
    );
    if (Number(purpose.balance) - amount < reserved) {
      return NextResponse.json(
        { error: '共有に割り当てられた資金が含まれているため、この金額は支出できません' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    await admin
      .from('fund_purposes')
      .update({ balance: Number(purpose.balance) - amount, updated_at: now })
      .eq('id', purposeId);

    const { data: pool } = await admin
      .from('donation_pool')
      .select('id, balance, total_spent')
      .limit(1)
      .maybeSingle();

    if (pool) {
      await admin
        .from('donation_pool')
        .update({
          balance: Math.max(0, Number(pool.balance) - amount),
          total_spent: Number(pool.total_spent) + amount,
          updated_at: now,
        })
        .eq('id', pool.id);
    }

    await admin.from('fund_transactions').insert({
      purpose_id: purposeId,
      user_id: user.id,
      type: 'spend',
      amount,
      related_shared_idea_id: typeof body.related_shared_idea_id === 'string'
        ? body.related_shared_idea_id
        : null,
      note,
    });

    return NextResponse.json({
      success: true,
      purpose_balance: Number(purpose.balance) - amount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Fund spend error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
