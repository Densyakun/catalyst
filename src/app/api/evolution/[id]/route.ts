import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { ProposalStatus } from '@/lib/types/evolution';

const ALLOWED: ProposalStatus[] = ['proposed', 'approved', 'in_progress', 'implemented', 'rejected'];

/**
 * PATCH /api/evolution/[id]  提案のステータス更新（承認/却下/完了）
 * DELETE /api/evolution/[id] 提案の削除
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

    const { status } = (await req.json()) as { status: ProposalStatus };
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('evolution_proposals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Evolution update error:', error);
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
      .from('evolution_proposals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Evolution delete error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
