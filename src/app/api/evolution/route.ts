import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { collectEvolutionSignals } from '@/lib/evolution/signals';
import { analyzeEvolution } from '@/lib/ai/agents/evolution';

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

    const signals = await collectEvolutionSignals(supabase, user.id);

    // シグナルが乏しい場合は分析しない（コスト保護）
    if (signals.stats.totalEvents === 0 && signals.stats.feedbackCount === 0) {
      return NextResponse.json({
        summary: '分析に必要なデータがまだ十分ではありません。',
        proposals: [],
      });
    }

    const analysis = await analyzeEvolution(signals);

    // 同じタイトルの未処理提案は重複させない
    const { data: existing } = await supabase
      .from('evolution_proposals')
      .select('title')
      .eq('user_id', user.id)
      .in('status', ['proposed', 'approved', 'in_progress']);
    const existingTitles = new Set((existing || []).map((e: { title: string }) => e.title));

    const toInsert = analysis.proposals
      .filter((p) => !existingTitles.has(p.title))
      .map((p) => ({
        user_id: user.id,
        title: p.title,
        category: p.category,
        rationale: p.rationale,
        target_area: p.target_area,
        proposed_change: p.proposed_change,
        priority: p.priority,
        evidence: p.evidence,
        signals: signals.stats,
        status: 'proposed',
      }));

    let inserted: unknown[] = [];
    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from('evolution_proposals')
        .insert(toInsert)
        .select();
      if (error) throw error;
      inserted = data || [];
    }

    return NextResponse.json({ summary: analysis.summary, proposals: inserted });
  } catch (error: unknown) {
    return handleError(error, 'Evolution analyze');
  }
}

function handleError(error: unknown, label: string) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
