import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const MAX_NAME_LENGTH = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      name?: unknown;
      description?: unknown;
      category?: unknown;
      target_amount?: unknown;
    };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: '目的の名前を入力してください' }, { status: 400 });
    }

    const rawTarget = typeof body.target_amount === 'string'
      ? Number(body.target_amount)
      : typeof body.target_amount === 'number'
        ? body.target_amount
        : 0;
    if (!Number.isFinite(rawTarget) || rawTarget < 0) {
      return NextResponse.json({ error: '目標金額が不正です' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('fund_purposes')
      .insert({
        owner_id: user.id,
        name: name.slice(0, MAX_NAME_LENGTH),
        description: typeof body.description === 'string' ? body.description.trim() : null,
        category: typeof body.category === 'string' ? body.category.trim() || null : null,
        target_amount: rawTarget,
        balance: 0,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Fund purpose create error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
