import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * POST /api/outcomes
 * 実行したアクションの結果（実行有無・満足度・不満点）を記録する。
 * 同じアクションに再回答した場合は最新の内容で上書きする。
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const actionId = typeof body.action_id === 'string' ? body.action_id : '';
    if (!actionId) {
      return NextResponse.json({ error: 'action_id is required' }, { status: 400 });
    }

    const { data: action, error: actionError } = await supabase
      .from('actions')
      .select('id, problem_id')
      .eq('id', actionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (actionError) throw actionError;
    if (!action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    const didExecute = Boolean(body.did_execute);
    const satisfaction =
      typeof body.satisfaction === 'number' && body.satisfaction >= 1 && body.satisfaction <= 5
        ? body.satisfaction
        : null;
    const complaint =
      typeof body.complaint === 'string' ? body.complaint.slice(0, 2000) : null;
    const feedbackDate = new Date().toISOString();

    const { data: existing } = await supabase
      .from('outcomes')
      .select('id')
      .eq('action_id', actionId)
      .order('feedback_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let saved;
    if (existing) {
      const { data, error } = await supabase
        .from('outcomes')
        .update({
          did_execute: didExecute,
          satisfaction,
          complaint,
          feedback_date: feedbackDate,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from('outcomes')
        .insert({
          action_id: actionId,
          did_execute: didExecute,
          satisfaction,
          complaint,
          feedback_date: feedbackDate,
        })
        .select()
        .single();
      if (error) throw error;
      saved = data;
    }

    // 実行して満足度が高い場合は課題を解決済みにする
    if (didExecute && satisfaction !== null && satisfaction >= 4 && action.problem_id) {
      await supabase
        .from('problems')
        .update({ status: 'solved' })
        .eq('id', action.problem_id)
        .eq('user_id', user.id);
    }

    return NextResponse.json(saved);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Outcome save error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
