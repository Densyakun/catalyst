import { supabase } from '@/lib/supabase';
import { StructuredProblem } from '@/lib/types/ai';

const ALPHA = 0.7; // 個人重要度の重み
const BETA = 0.3;  // 社会影響度の重み

/**
 * Prioritizer Agent:
 * 課題に対して「社会影響度」を付与し、最終的な優先スコアを算出します。
 */
export async function prioritizeProblem(problem: StructuredProblem): Promise<StructuredProblem> {
  // 0. ユーザーの活動量に基づいたブースト計算
  const { data: { user } } = await supabase.auth.getUser();
  let visitBoost = 0;
  
  if (user) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('user_activity')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('activity_type', 'visit')
      .gt('created_at', yesterday);

    // 1日3回以上の訪問で、1回につき0.05のブースト（最大0.2）
    visitBoost = Math.min(0.2, (count || 0) * 0.05);
  }

  const adjustedPersonalPriority = Math.min(1.0, problem.personal_priority + visitBoost);

  // 1. 最も近いクラスターを特定
  // ※将来的にベクトル検索にアップグレード可能
  const { data: clusters, error } = await supabase
    .from('clusters')
    .select('id, tags, problem_count')
    .overlaps('tags', problem.tags);

  let bestCluster = null;
  if (clusters && clusters.length > 0) {
    // 最もタグの重なりが多い、または課題数が多いクラスターを選択
    bestCluster = clusters.sort((a, b) => b.problem_count - a.problem_count)[0];
  }

  // 2. 社会影響度の算出 (0.0 - 1.0)
  // クラスターのサイズ（課題数）をベースに算出。10件以上で最大値 1.0 とする簡易ロジック。
  const socialImpact = bestCluster ? Math.min(1.0, bestCluster.problem_count / 10) : 0.1;

  // 3. 総合優先スコアの計算
  const priorityScore = (ALPHA * adjustedPersonalPriority) + (BETA * socialImpact);

  return {
    ...problem,
    personal_priority: adjustedPersonalPriority,
    social_impact: socialImpact,
    priority_score: priorityScore,
    cluster_id: bestCluster?.id,
  };
}

/**
 * 複数の課題をソートして上位を抽出
 */
export function sortProblems(problems: StructuredProblem[], limit: number = 3): StructuredProblem[] {
  return [...problems]
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, limit);
}
