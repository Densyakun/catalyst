import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { UIVariantStatus } from '@/lib/types/evolution';

const ALLOWED: UIVariantStatus[] = ['proposed', 'active', 'archived'];

/**
 * PATCH /api/ui-variants/[id]  ステータス変更（適用/アーカイブ）
 * DELETE /api/ui-variants/[id] 削除
 *
 * 同じ area のバリアントを active にした場合、他のバリアントは自動で archived にする。
 */
export async function PATCH(
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

    const { status } = (await req.json()) as { status: UIVariantStatus };
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    const { data: current, error: fetchError } = await supabase
      .from('ui_variants')
      .select('id, area')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (fetchError) throw fetchError;

    if (status === 'active') {
      await supabase
        .from('ui_variants')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('area', current.area)
        .neq('id', id);
    }

    const { data, error } = await supabase
      .from('ui_variants')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, area, description, status, performance')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('UI variant update error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('ui_variants')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('UI variant delete error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
