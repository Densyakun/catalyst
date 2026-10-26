import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * 「今日の1つ」の緊急度をユーザーの実感に合わせて補正する。
 * AIの整理結果が実態と異なるときに、手動で下げられるようにする。
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { kind, id, action } = await req.json();

    if (!id || action !== 'not_urgent' || (kind !== 'problem' && kind !== 'insight')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (kind === 'problem') {
      const { data: problem, error } = await supabase
        .from('problems')
        .select('id, severity, priority, priority_score')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error || !problem) {
        return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
      }

      const { error: updateError } = await supabase
        .from('problems')
        .update({
          severity: Math.min(problem.severity ?? 0, 3),
          priority: 0,
          priority_score: 0,
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    } else {
      const { data: insight, error } = await supabase
        .from('auto_insights')
        .select('id, content')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error || !insight) {
        return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
      }

      const content = (insight.content || '').replace(
        /緊急度[:：]\s*(high|medium|緊急|重要)/g,
        '緊急度: low',
      );

      const { error: updateError } = await supabase
        .from('auto_insights')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Focus urgency update error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
