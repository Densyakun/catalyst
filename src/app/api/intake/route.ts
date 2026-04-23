import { NextResponse } from 'next/server';
import { getNextIntakeStep, structureProblem } from '@/lib/ai/agents/intake';
import { proposeActions } from '@/lib/ai/agents/solver';
import { updateClusters } from '@/lib/ai/agents/clusterer';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { answers } = await req.json();

    // 次のステップを取得
    const step = await getNextIntakeStep(answers);

    // まだ質問が続く場合
    if (step.type === 'question') {
      return NextResponse.json(step);
    }

    // 診断完了：構造化（複数課題の可能性あり）
    const problemsData = await structureProblem(answers);
    const results = [];

    for (const pData of problemsData) {
      // 各課題を Supabase に保存
      const { data: problem, error: pError } = await supabase
        .from('problems')
        .insert([pData])
        .select()
        .single();

      if (pError) throw pError;

      // 各課題に対するアクションの生成
      const actions = await proposeActions(problem);

      const actionsWithId = actions.map(a => ({
        description: a.description,
        reason: a.reason || '', // schemaに合わせて調整
        type: a.type,
        cost: a.cost,
        expected_gain: a.expectedGain,
        risk: a.risk,
        link: a.link,
        is_recommended: a.isRecommended,
        problem_id: problem.id
      }));

      const { data: savedActions, error: aError } = await supabase
        .from('actions')
        .insert(actionsWithId)
        .select();

      if (aError) throw aError;

      results.push({
        problem,
        actions: savedActions
      });
    }

    // 自律的進化：クラスターを非同期で更新（待機せずにレスポンスを返す）
    updateClusters().catch(err => console.error('Auto-clustering error:', err));

    return NextResponse.json({
      type: 'result',
      results // 複数の診断結果を返す
    });

  } catch (error: any) {
    console.error('Intake API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
