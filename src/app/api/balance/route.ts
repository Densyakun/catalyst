import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getUserBalance } from '@/lib/cost/model';

/**
 * GET: ユーザー残高と寄付プール情報
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const balance = await getUserBalance(user.id);

    // 寄付プール
    const { data: pool } = await supabase
      .from('donation_pool')
      .select('balance, total_donated, total_spent')
      .limit(1)
      .single();

    // コストログ集計
    const { data: costSummary } = await supabase
      .from('cost_log')
      .select('actual_cost, operation_type')
      .eq('user_id', user.id);

    const totalSpent = (costSummary || []).reduce(
      (sum, entry) => sum + Number(entry.actual_cost), 0,
    );

    const costByOperation: Record<string, number> = {};
    for (const entry of costSummary || []) {
      const key = entry.operation_type;
      costByOperation[key] = (costByOperation[key] || 0) + Number(entry.actual_cost);
    }

    return NextResponse.json({
      user_balance: balance,
      total_spent: Math.round(totalSpent * 100) / 100,
      cost_breakdown: costByOperation,
      donation_pool: pool || { balance: 0, total_donated: 0, total_spent: 0 },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: 寄付
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { amount, related_project_id, related_insight_id } = await req.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    // 寄付記録
    await supabase.from('donations').insert({
      user_id: user.id,
      amount,
      related_project_id: related_project_id || null,
      related_insight_id: related_insight_id || null,
    });

    // 寄付プール更新
    const { data: pool } = await supabase
      .from('donation_pool')
      .select('id, balance, total_donated')
      .limit(1)
      .single();

    if (pool) {
      await supabase
        .from('donation_pool')
        .update({
          balance: Number(pool.balance) + amount,
          total_donated: Number(pool.total_donated) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pool.id);
    }

    return NextResponse.json({ success: true, new_pool_balance: Number(pool?.balance || 0) + amount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
