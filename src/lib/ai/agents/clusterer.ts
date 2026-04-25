import { generateObjectWithFallback } from '../call';
import { models } from '../models';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { ProblemCluster } from '@/lib/types/ai';

/**
 * Clusterer Agent: 
 * 蓄積された個人の課題を分析し、共通の「社会課題クラスター」を生成・更新します。
 */
export async function updateClusters() {
  // 1. 最近の課題を20件取得
  const { data: problems, error: pError } = await supabase
    .from('problems')
    .select('id, context, goal, tags')
    .not('user_id', 'is', null) // アカウント機能以前のデータを集計から除外
    .order('created_at', { ascending: false })
    .limit(20);

  if (pError || !problems || problems.length < 3) return;

  // 2. AI に課題のパターンを分析させ、共通クラスターを特定させる
  const { object } = await generateObjectWithFallback<{ clusters: ProblemCluster[] }>({
    schema: z.object({
      clusters: z.array(z.object({
        title: z.string().describe('タイトル'),
        description: z.string().describe('要約'),
        tags: z.array(z.string()).describe('タグ'),
        representative_problem_ids: z.array(z.string()).describe('課題IDリスト'),
        dynamic_ui: z.object({
          type: z.enum(['collaboration', 'resource_share', 'petition', 'data_gathering']).describe('種別'),
          actionLabel: z.string().describe('ラベル'),
          description: z.string().describe('理由'),
          target_goal: z.string().optional().describe('目標'),
        }),
      })).max(5),
    }),
    prompt: `Catalyst Insightエージェント。共通課題(クラスター)を抽出せよ。
【ミッション】
1. 孤独の解消: 「自分だけではない」ことを可視化。
2. 段階的協力: まず実態把握(data_gathering)等の低ハードルな協力を提案。

【課題データ】
${JSON.stringify(problems)}
`,
    maxTokens: 2000,
  }, models.structuring as any);

  // 3. 取得したクラスター情報を DB に反映
  if (object && object.clusters && object.clusters.length > 0) {
    const { error: dError } = await supabase.from('clusters').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // 全削除
    if (dError) console.error('Cluster delete error:', dError);

    const { error: iError } = await supabase.from('clusters').insert(
      object.clusters.map((c: ProblemCluster) => ({
        title: c.title,
        description: c.description,
        tags: c.tags,
        problem_count: c.representative_problem_ids.length,
        dynamic_ui: c.dynamic_ui // 動的UIの定義を保存
      }))
    );
    if (iError) console.error('Cluster insert error:', iError);
  }
}
