import { supabase } from '@/lib/supabase';
import { StructuredProblem } from '@/lib/types/ai';
import {
  DEFAULT_PRIORITY_CRITERIA,
  PriorityCriteria,
  buildPriorityBreakdown,
  clampScore,
  scorePersonalIndicators,
  scoreSocialIndicators,
} from '@/lib/priority';

/**
 * Prioritizer Agent:
 * 個人指標と社会指標を別々に評価し、その根拠とともに優先スコアを算出します。
 */
export async function prioritizeProblem(
  problem: StructuredProblem,
  criteria: PriorityCriteria = DEFAULT_PRIORITY_CRITERIA,
): Promise<StructuredProblem> {
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

  // 1. 個人指標の評価（未提供時は従来の personal_priority をそのまま使う）
  const personalIndicators = problem.personal_indicators ?? {
    urgency: clampScore(problem.personal_priority),
    impact: clampScore(problem.personal_priority),
    solvability: clampScore(problem.personal_priority),
  };
  const personalScore = problem.personal_indicators
    ? scorePersonalIndicators(problem.personal_indicators, criteria)
    : clampScore(problem.personal_priority);
  const adjustedPersonalPriority = clampScore(personalScore + visitBoost);

  // 2. 最も近いクラスターを特定
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

  // 3. 社会指標の評価 (0.0 - 1.0)
  // クラスターのサイズ（課題数）をベースに算出。10件以上で最大値 1.0 とする簡易ロジック。
  const clusterSocialImpact = bestCluster ? Math.min(1.0, bestCluster.problem_count / 10) : 0.1;
  const socialIndicators = problem.social_indicators ?? {
    reach: clusterSocialImpact,
    beneficiaries: clusterSocialImpact,
    sustainability: 0.5,
  };
  const socialScore = problem.social_indicators
    ? scoreSocialIndicators(problem.social_indicators, criteria)
    : clusterSocialImpact;

  // 4. 個人・社会を別枠で統合し、計算根拠を残す
  const breakdown = buildPriorityBreakdown({
    personalScore: adjustedPersonalPriority,
    socialScore,
    personalIndicators,
    socialIndicators,
    criteria,
    personalEvaluated: Boolean(problem.personal_indicators),
    socialEvaluated: Boolean(problem.social_indicators),
    visitBoost,
    socialSource: bestCluster
      ? `社会指標はクラスター「${bestCluster.id}」の規模（${bestCluster.problem_count}件）から推定`
      : '社会指標はクラスター未所属のため推定値',
  });

  return {
    ...problem,
    personal_priority: adjustedPersonalPriority,
    social_impact: socialScore,
    social_priority_score: socialScore,
    priority_score: breakdown.priorityScore,
    priority_reason: breakdown.reason,
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
