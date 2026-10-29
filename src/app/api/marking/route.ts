import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ruleBasedMarking, llmScoring } from '@/lib/ai/agents/marker';
import { logCost, estimateOperationCost, exceedsCostLimit } from '@/lib/cost/model';

/**
 * GET: 目星済みアイテム一覧
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('marked_items')
      .select('*')
      .eq('user_id', user.id)
      .order('relevance_score', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: 自動目星つけ（Layer 0→1）
 * context パラメータに基づいて関連アイテムを自動選択
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { context, threshold = 0.5, use_llm = false, max_cost } = await req.json();

    if (!context) {
      return NextResponse.json({ error: 'context is required' }, { status: 400 });
    }

    const costLimit = max_cost == null ? undefined : Number(max_cost);
    if (costLimit !== undefined && (!Number.isFinite(costLimit) || costLimit < 0)) {
      return NextResponse.json({ error: 'max_cost must be a non-negative number' }, { status: 400 });
    }

    // 課題とリソースを取得
    const [insightsResult, resourcesResult] = await Promise.all([
      supabase
        .from('auto_insights')
        .select('id, title, content, insight_type')
        .eq('user_id', user.id)
        .in('status', ['pending', 'in_progress']),
      supabase
        .from('user_resources')
        .select('id, name, description, resource_type')
        .eq('user_id', user.id),
    ]);

    const insights = (insightsResult.data || []).map((i) => ({
      id: i.id,
      type: i.insight_type,
      description: `${i.title}: ${i.content}`,
    }));

    const resources = (resourcesResult.data || []).map((r) => ({
      id: r.id,
      type: r.resource_type,
      description: `${r.name}: ${r.description || ''}`,
    }));

    const allItems = [...insights, ...resources];

    // Layer 0: ルールベース
    let results = ruleBasedMarking(allItems, context);

    // Layer 1: LLMスコアリング（オプション）
    let scoringCost = 0;
    let appliedLayer = 0;
    let costLimited = false;

    if (use_llm) {
      const layer0Passed = allItems.filter((_, i) =>
        (results[i]?.relevance_score ?? 0) >= 0.3,
      );

      if (layer0Passed.length > 0) {
        const estimatedScoringCost = estimateOperationCost('scoring', layer0Passed.length);

        // コスト上限を超える場合は LLM を呼ばず、ルールベースの結果を維持する
        if (exceedsCostLimit(estimatedScoringCost, costLimit)) {
          costLimited = true;
        } else {
          const llmResults = await llmScoring(layer0Passed, context);

          // Layer 1の結果でスコアを上書き
          results = results.map((r) => {
            const llmResult = llmResults.find((lr) => lr.item_id === r.item_id);
            if (llmResult) {
              return { ...r, relevance_score: llmResult.relevance_score, reason: llmResult.reason };
            }
            return r;
          });

          scoringCost = estimatedScoringCost;
          appliedLayer = 1;
        }
      }
    }

    // 目星付けの実コストを記録（ルールベースのみの場合も 0 円で記録）
    if (allItems.length > 0) {
      await logCost({
        userId: user.id,
        operationType: 'marking',
        actualCost: scoringCost,
        inputItemIds: allItems.map((i) => i.id),
      });
    }

    // 閾値以上のアイテムをマーク
    const markedResults = results.filter((r) => r.relevance_score >= threshold);

    // 既存のマークをクリアして再作成
    await supabase
      .from('marked_items')
      .delete()
      .eq('user_id', user.id);

    if (markedResults.length > 0) {
      const markRecords = markedResults.map((r) => {
        const item = allItems.find((i) => i.id === r.item_id);
        return {
          user_id: user.id,
          item_type: item?.type === 'detected_problem' ? 'insight' : 'resource',
          item_id: r.item_id,
          relevance_score: r.relevance_score,
          scoring_cost: appliedLayer === 1 ? estimateOperationCost('scoring', 1) : 0,
          layer: appliedLayer,
          context: r.reason,
        };
      });

      await supabase.from('marked_items').insert(markRecords);
    }

    return NextResponse.json({
      marked_count: markedResults.length,
      total_evaluated: allItems.length,
      items: markedResults,
      cost: {
        actual: scoringCost,
        limit: costLimit ?? null,
        cost_limited: costLimited,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Marking error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT: 手動で目星を追加/削除
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { item_id, item_type, action } = await req.json();

    if (!item_id || !item_type || !action) {
      return NextResponse.json({ error: 'item_id, item_type, and action are required' }, { status: 400 });
    }

    if (action === 'add') {
      await supabase.from('marked_items').upsert({
        user_id: user.id,
        item_type,
        item_id,
        relevance_score: 1.0, // 手動マーク = 最高スコア
        layer: -1, // 手動
        context: 'ユーザーが手動で追加',
      });
    } else if (action === 'remove') {
      await supabase
        .from('marked_items')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', item_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
