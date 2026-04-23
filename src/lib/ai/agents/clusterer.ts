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
  // ... (取得処理は変更なし)
  const { data: problems, error: pError } = await supabase
    .from('problems')
    .select('id, context, goal, tags')
    .order('created_at', { ascending: false })
    .limit(50);

  if (pError || !problems || problems.length < 3) return;

  // 2. AI に課題のパターンを分析させ、共通クラスターを特定させる
  const { object } = await generateObjectWithFallback<{ clusters: ProblemCluster[] }>({
    schema: z.object({
      clusters: z.array(z.object({
        title: z.string().describe('クラスターのキャッチーなタイトル'),
        description: z.string().describe('この課題群の共通点や背景の要約'),
        tags: z.array(z.string()).describe('関連するタグ'),
        representative_problem_ids: z.array(z.string()).describe('このクラスターに属する代表的な課題のID'),
      })).max(5),
    }),
    prompt: `あなたは Catalyst システムの Insight エージェントです。
以下の個々の課題データを分析し、共通する「悩みや課題のクラスター」を最大5つ作成してください。

【目的】
個人の悩みを集約し、「多くの人が直面している共通の課題」として可視化することで、解決策の共有を促進します。

【課題データ】
${JSON.stringify(problems)}

【出力のガイドライン】
- 抽象化しすぎず、かつ個別具体的すぎない、人々の共感を呼ぶタイトルにしてください。
- 解決のヒントになるような説明を添えてください。
`,
  }, models.structuring);

  // 3. 取得したクラスター情報を DB に反映
  if (object && object.clusters && object.clusters.length > 0) {
    const { error: dError } = await supabase.from('clusters').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // 全削除
    if (dError) console.error('Cluster delete error:', dError);

    const { error: iError } = await supabase.from('clusters').insert(
      object.clusters.map((c: ProblemCluster) => ({
        title: c.title,
        description: c.description,
        tags: c.tags,
        problem_count: c.representative_problem_ids.length
      }))
    );
    if (iError) console.error('Cluster insert error:', iError);
  }
}
