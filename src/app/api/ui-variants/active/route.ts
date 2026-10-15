import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * GET /api/ui-variants/active?area=xxx
 * その領域で有効なUIバリアントのコードと描画データを返す。
 * 実際のコンパイル/評価はクライアント（ブラウザ）で tsx-safe-eval により行う。
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const area = new URL(req.url).searchParams.get('area');
    if (!area) {
      return NextResponse.json({ error: 'area is required' }, { status: 400 });
    }

    const { data: variant, error } = await supabase
      .from('ui_variants')
      .select('id, code')
      .eq('area', area)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!variant) {
      return NextResponse.json({ id: null, code: null });
    }

    const data = await buildRenderData(supabase, user.id);
    return NextResponse.json({ id: variant.id, code: variant.code, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('UI variant active error:', error);
    return NextResponse.json({ id: null, code: null, error: message });
  }
}

type SessionClient = Awaited<ReturnType<typeof createClient>>;

async function buildRenderData(
  supabase: SessionClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const [problemsRes, insightsRes, activityRes] = await Promise.all([
    supabase
      .from('problems')
      .select('context, priority, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('auto_insights')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress']),
    supabase
      .from('user_activity')
      .select('id')
      .eq('user_id', userId)
      .eq('activity_type', 'visit')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const problems = (problemsRes.data || []) as Array<{ context: string | null; priority: number | null }>;
  const topPriority = problems
    .slice()
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];

  return {
    problems: problems.map((p) => p.context || '').filter(Boolean),
    topPriority: topPriority?.context || '',
    insightCount: (insightsRes.data || []).length,
    visitCount: (activityRes.data || []).length,
  };
}
