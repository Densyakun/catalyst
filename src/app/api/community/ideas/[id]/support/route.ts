import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { notifyUser } from '@/lib/notifications';
import type { SupportType } from '@/lib/types/community';

const SUPPORT_TYPES: SupportType[] = ['money', 'time', 'skill'];

function parseSupportType(value: unknown): SupportType | null {
  return typeof value === 'string' && SUPPORT_TYPES.includes(value as SupportType)
    ? value as SupportType
    : null;
}

function parseAmount(value: unknown): number | null {
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

function supportLabel(type: SupportType, amount?: number | null): string {
  if (type === 'money') return `¥${(amount || 0).toLocaleString()} の資金支援`;
  if (type === 'time') return '時間での協力';
  return 'スキルでの協力';
}

/**
 * POST /api/community/ideas/[id]/support
 * 共有アイデアに資金・時間・スキルで協力する。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      support_type?: unknown;
      amount?: unknown;
      message?: unknown;
    };
    const supportType = parseSupportType(body.support_type);
    if (!supportType) {
      return NextResponse.json({ error: '支援方法が不正です' }, { status: 400 });
    }

    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : null;
    const amount = supportType === 'money' ? parseAmount(body.amount) : null;
    if (supportType === 'money' && amount == null) {
      return NextResponse.json({ error: '金額が不正です' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: idea } = await admin
      .from('shared_ideas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!idea) {
      return NextResponse.json({ error: '共有アイデアが見つかりません' }, { status: 404 });
    }
    if (idea.status === 'closed' || idea.status === 'completed') {
      return NextResponse.json({ error: 'このアイデアは受付を終了しています' }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (supportType === 'money' && amount != null) {
      const { error: donationError } = await admin.from('donations').insert({
        user_id: user.id,
        amount,
        purpose_id: idea.purpose_id,
        related_insight_id: idea.insight_id,
        message,
      });
      if (donationError) throw donationError;

      if (idea.purpose_id) {
        const { data: purpose } = await admin
          .from('fund_purposes')
          .select('balance')
          .eq('id', idea.purpose_id)
          .maybeSingle();
        if (purpose) {
          await admin
            .from('fund_purposes')
            .update({ balance: Number(purpose.balance) + amount, updated_at: now })
            .eq('id', idea.purpose_id);
        }
      }

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
        purpose_id: idea.purpose_id,
        user_id: user.id,
        type: 'donation',
        amount,
        related_shared_idea_id: id,
        note: message,
      });
    }

    const funded = Number(idea.funded_amount) + (amount || 0);
    const reached = Number(idea.target_amount) > 0 && funded >= Number(idea.target_amount);
    await admin
      .from('shared_ideas')
      .update({
        funded_amount: funded,
        supporter_count: Number(idea.supporter_count) + 1,
        status: reached && idea.status === 'open' ? 'in_progress' : idea.status,
        updated_at: now,
      })
      .eq('id', id);

    const { data: supporter, error: supporterError } = await admin
      .from('shared_idea_supporters')
      .insert({
        shared_idea_id: id,
        user_id: user.id,
        support_type: supportType,
        amount,
        message,
        status: 'offered',
      })
      .select()
      .single();

    if (supporterError) throw supporterError;

    if (idea.owner_id !== user.id) {
      await notifyUser(admin, {
        userId: idea.owner_id,
        title: '共有アイデアに協力の申し出がありました',
        body: supportLabel(supportType, amount),
        detail: message,
        kind: 'info',
      });
    }

    return NextResponse.json({ success: true, supporter, funded_amount: funded });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Community idea support error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
