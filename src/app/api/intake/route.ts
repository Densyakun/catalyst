import { NextResponse } from 'next/server';
import { getNextIntakeStep, structureProblem } from '@/lib/ai/agents/intake';
import { proposeActions } from '@/lib/ai/agents/solver';
import { updateClusters } from '@/lib/ai/agents/clusterer';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { answers, sessionId } = await req.json();

    // ユーザー情報の取得
    const { data: { user } } = await supabase.auth.getUser();

    // 次のステップを取得
    const step = await getNextIntakeStep(answers);

    // まだ質問が続く場合
    if (step.type === 'question') {
      if (user) {
        await supabase.from('diagnostic_sessions').upsert({
          id: sessionId || undefined,
          user_id: user.id,
          answers,
          current_question: step,
          is_completed: false,
          updated_at: new Date().toISOString()
        });
      }
      return NextResponse.json(step);
    }

    // 診断完了：構造化（複数課題の可能性あり）
    const problemsData = await structureProblem(answers);
    const results = [];

    for (const pData of problemsData) {
      // データベースへの保存
      const { data: problem, error: pError } = await supabase
        .from('problems')
        .insert({
          context: pData.context,
          symptoms: pData.symptoms,
          constraints: pData.constraints,
          goal: pData.goal,
          severity: pData.severity,
          frequency: pData.frequency,
          tags: pData.tags,
          user_id: user?.id // ログインユーザーIDを紐付け
        })
        .select()
        .single();

      if (pError) throw pError;

      // 各課題に対するアクションの生成
      const actions = await proposeActions(problem);

      const actionsWithId = actions.map(a => ({
        description: a.description,
        reason: a.reason,
        type: a.type,
        time_cost: a.cost.time,
        money_cost: a.cost.money,
        expected_gain: a.expectedGain,
        risk: a.risk,
        link: a.link,
        is_recommended: a.isRecommended,
        problem_id: problem.id,
        user_id: user?.id // アクションにもユーザーIDを紐付け（RLSのため）
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

    // セッションの完了処理
    if (user && sessionId) {
      await supabase.from('diagnostic_sessions').update({ is_completed: true }).eq('id', sessionId);
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
