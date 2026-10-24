import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getUserBalance } from '@/lib/cost/model';
import { recommendFundingSource } from '@/lib/funds/optimize';
import type { FundPurpose, FundTransaction } from '@/lib/types/funds';

const DEFAULT_COST_PER_IDEA = 5;

/**
 * GET /api/funds
 * 残高・目的資金・直近の資金移動・コスト最適化の推奨を返す。
 * ?amount=5&is_social=1 で推奨額を指定できる。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const requestedAmount = Number(url.searchParams.get('amount') ?? DEFAULT_COST_PER_IDEA);
    const amount = Number.isFinite(requestedAmount) && requestedAmount > 0
      ? requestedAmount
      : DEFAULT_COST_PER_IDEA;
    const isSocial = url.searchParams.get('is_social') === '1';

    const userBalance = await getUserBalance(user.id);

    const [poolRes, purposesRes, transactionsRes] = await Promise.all([
      supabase
        .from('donation_pool')
        .select('balance, total_donated, total_spent')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('fund_purposes')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('fund_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    const purposes = ((purposesRes.data || []) as FundPurpose[]).map((purpose) => ({
      ...purpose,
      is_owner: purpose.owner_id === user.id,
    }));
    const transactions = (transactionsRes.data || []) as FundTransaction[];
    const purposeBalance = purposes
      .filter((purpose) => purpose.owner_id === user.id)
      .reduce((max, purpose) => Math.max(max, Number(purpose.balance)), 0);
    const pool = poolRes.data || { balance: 0, total_donated: 0, total_spent: 0 };

    return NextResponse.json({
      user_balance: userBalance,
      donation_pool: {
        balance: Number(pool.balance),
        total_donated: Number(pool.total_donated),
        total_spent: Number(pool.total_spent),
      },
      purposes,
      transactions,
      cost_per_idea: DEFAULT_COST_PER_IDEA,
      recommended_plan: recommendFundingSource({
        amount,
        isSocial,
        userBalance,
        purposeBalance,
        poolBalance: Number(pool.balance),
      }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Funds fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
