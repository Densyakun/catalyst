import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { runEvolutionAnalysis } from '@/lib/evolution/run';

/**
 * 自己進化エンジン。
 *
 * GET  /api/evolution  → 改善提案の一覧
 * POST /api/evolution  → シグナルを収集し、AIが改善提案を生成して保存
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('evolution_proposals')
      .select('*')
      .eq('user_id', user.id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: unknown) {
    return handleError(error, 'Evolution fetch');
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runEvolutionAnalysis(supabase, user.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return handleError(error, 'Evolution analyze');
  }
}

function handleError(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
