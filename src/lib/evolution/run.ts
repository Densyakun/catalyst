import type { SupabaseClient } from '@supabase/supabase-js';
import { collectEvolutionSignals } from '@/lib/evolution/signals';
import { buildLlmHealthProposals } from '@/lib/evolution/llm-health';
import { analyzeEvolution } from '@/lib/ai/agents/evolution';
import type { EvolutionProposal } from '@/lib/types/evolution';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchExistingTitles(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('evolution_proposals')
    .select('title')
    .eq('user_id', userId)
    .in('status', ['proposed', 'approved', 'in_progress']);
  return new Set((data || []).map((row: { title: string }) => row.title));
}

async function insertProposals(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<EvolutionProposal[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('evolution_proposals')
    .insert(rows)
    .select();
  if (error) throw error;
  return (data || []) as EvolutionProposal[];
}

/**
 * 自己進化の分析を実行し、重複しない改善提案を保存する。
 * Web UI（ユーザーセッション）とエージェントAPI（service_role）で共有する。
 *
 * LLM 呼び出しログの異常は、AI 分析が失敗しても検知できるよう
 * 先に決定的なルールで提案化する。
 */
export async function runEvolutionAnalysis(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ summary: string; proposals: EvolutionProposal[]; signalCount: number }> {
  const signals = await collectEvolutionSignals(supabase, userId);
  const healthDrafts = buildLlmHealthProposals(signals.llmHealth);
  const existingTitles = await fetchExistingTitles(supabase, userId);

  const healthToInsert = healthDrafts
    .filter((draft) => !existingTitles.has(draft.title))
    .map((draft) => {
      existingTitles.add(draft.title);
      return {
        user_id: userId,
        title: draft.title,
        category: draft.category,
        rationale: draft.rationale,
        target_area: draft.target_area,
        proposed_change: draft.proposed_change,
        priority: draft.priority,
        evidence: draft.evidence,
        signals: {
          ...signals.stats,
          llmHealth: {
            ...signals.llmHealth,
            findings: [draft.finding],
            groups: [draft.group],
          },
        },
        status: 'proposed',
      };
    });

  const inserted = await insertProposals(supabase, healthToInsert);

  const hasData =
    signals.stats.totalEvents > 0 ||
    signals.stats.feedbackCount > 0 ||
    signals.llmHealth.totalCalls > 0;

  if (!hasData) {
    return {
      summary: '分析に必要なデータがまだ十分ではありません。フィードバックや操作ログが溜まってから再実行してください。',
      proposals: inserted,
      signalCount: 0,
    };
  }

  let analysisSummary: string | null = null;
  let analysisError: string | null = null;

  try {
    const analysis = await analyzeEvolution(signals);
    analysisSummary = analysis.summary;

    const aiToInsert = analysis.proposals
      .filter((proposal) => !existingTitles.has(proposal.title))
      .map((proposal) => ({
        user_id: userId,
        title: proposal.title,
        category: proposal.category,
        rationale: proposal.rationale,
        target_area: proposal.target_area,
        proposed_change: proposal.proposed_change,
        priority: proposal.priority,
        evidence: proposal.evidence,
        signals: signals.stats,
        status: 'proposed',
      }));

    inserted.push(...(await insertProposals(supabase, aiToInsert)));
  } catch (error) {
    analysisError = getErrorMessage(error);
    console.error('Evolution analysis error:', error);
  }

  const summary =
    analysisSummary ??
    (healthDrafts.length > 0
      ? `LLMの異常を${healthDrafts.length}件検知し、モデル変更の提案を記録しました。AI分析は失敗しました: ${analysisError}`
      : `AI分析に失敗しました: ${analysisError}`);

  return {
    summary,
    proposals: inserted,
    signalCount:
      signals.stats.totalEvents + signals.stats.feedbackCount + signals.llmHealth.totalCalls,
  };
}
