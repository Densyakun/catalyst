import type { SupabaseClient } from '@supabase/supabase-js';
import { collectEvolutionSignals } from '@/lib/evolution/signals';
import { analyzeEvolution } from '@/lib/ai/agents/evolution';
import type { EvolutionProposal } from '@/lib/types/evolution';

/**
 * 自己進化の分析を実行し、重複しない改善提案を保存する。
 * Web UI（ユーザーセッション）とエージェントAPI（service_role）で共有する。
 */
export async function runEvolutionAnalysis(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ summary: string; proposals: EvolutionProposal[]; signalCount: number }> {
  const signals = await collectEvolutionSignals(supabase, userId);

  if (signals.stats.totalEvents === 0 && signals.stats.feedbackCount === 0) {
    return {
      summary: '分析に必要なデータがまだ十分ではありません。フィードバックや操作ログが溜まってから再実行してください。',
      proposals: [],
      signalCount: 0,
    };
  }

  const analysis = await analyzeEvolution(signals);

  const { data: existing } = await supabase
    .from('evolution_proposals')
    .select('title')
    .eq('user_id', userId)
    .in('status', ['proposed', 'approved', 'in_progress']);
  const existingTitles = new Set((existing || []).map((e: { title: string }) => e.title));

  const toInsert = analysis.proposals
    .filter((p) => !existingTitles.has(p.title))
    .map((p) => ({
      user_id: userId,
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

  let inserted: EvolutionProposal[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('evolution_proposals')
      .insert(toInsert)
      .select();
    if (error) throw error;
    inserted = (data || []) as EvolutionProposal[];
  }

  return {
    summary: analysis.summary,
    proposals: inserted,
    signalCount: signals.stats.totalEvents + signals.stats.feedbackCount,
  };
}
