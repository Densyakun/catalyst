import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateIdeas } from '@/lib/ai/agents/idea-generator';
import { assessScale } from '@/lib/ai/agents/decomposer';
import { logCost, estimateOperationCost, calculateCostEstimate, exceedsCostLimit } from '@/lib/cost/model';

/**
 * POST: 目星済みアイテムからアイデアを生成
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { context, max_cost } = await req.json();

    const costLimit = max_cost == null ? undefined : Number(max_cost);
    if (costLimit !== undefined && (!Number.isFinite(costLimit) || costLimit < 0)) {
      return NextResponse.json({ error: 'max_cost must be a non-negative number' }, { status: 400 });
    }

    // 目星済みアイテムを取得（根拠も含める）
    const { data: markedItems } = await supabase
      .from('marked_items')
      .select('item_id, item_type, relevance_score, context')
      .eq('user_id', user.id)
      .order('relevance_score', { ascending: false });

    if (!markedItems || markedItems.length === 0) {
      return NextResponse.json({ error: '目星をつけたアイテムがありません。先に目星をつけてください。' }, { status: 400 });
    }

    // コスト上限チェック（生成前に推定コストで判定）
    const estimatedCost = estimateOperationCost('idea_generation', 1);
    if (exceedsCostLimit(estimatedCost, costLimit)) {
      return NextResponse.json({
        error: `コスト上限（¥${costLimit}）を超えるため生成を中止しました。推定コスト: ¥${estimatedCost}`,
        estimated_cost: estimatedCost,
        max_cost: costLimit,
      }, { status: 400 });
    }

    // 課題とリソースに分類して詳細取得
    const insightIds = markedItems.filter((m) => m.item_type === 'insight').map((m) => m.item_id);
    const resourceIds = markedItems.filter((m) => m.item_type === 'resource').map((m) => m.item_id);

    const [insightsResult, resourcesResult] = await Promise.all([
      insightIds.length > 0
        ? supabase.from('auto_insights').select('title, content').in('id', insightIds)
        : Promise.resolve({ data: [] }),
      resourceIds.length > 0
        ? supabase.from('user_resources').select('name, resource_type, description').in('id', resourceIds)
        : Promise.resolve({ data: [] }),
    ]);

    const problems = (insightsResult.data || []).map((i) => {
      const urgencyMatch = i.content.match(/緊急度:\s*(low|medium|high)/);
      return {
        description: i.title,
        urgency: urgencyMatch?.[1] || 'medium',
      };
    });

    const resources = (resourcesResult.data || []).map((r) => ({
      name: r.name,
      type: r.resource_type,
      description: r.description || '',
    }));

    // 生成に使った情報と根拠（アイデアに紐付けて保存する）
    const sources = markedItems.map((m) => ({
      item_id: m.item_id,
      item_type: m.item_type,
      relevance_score: m.relevance_score,
      reason: m.context,
    }));
    const evidenceText = sources
      .map((s) => `- ${s.item_type}:${s.item_id}（関連度 ${s.relevance_score}）${s.reason ? ` ${s.reason}` : ''}`)
      .join('\n');

    // アイデア生成
    const ideas = await generateIdeas(problems, resources, context);

    // コストログ
    await logCost({
      userId: user.id,
      operationType: 'idea_generation',
      actualCost: estimatedCost,
      inputItemIds: markedItems.map((m) => m.item_id),
    });

    // 各アイデアをインサイトとして保存 + 規模判定
    const savedIdeas = [];
    for (const idea of ideas) {
      // 規模判定
      const scale = await assessScale(idea.description);

      // コスト推定
      const costEstimate = await calculateCostEstimate(
        idea.estimated_cost.money,
        idea.is_social,
        idea.category,
      );

      const { data: insight, error } = await supabase
        .from('auto_insights')
        .insert({
          user_id: user.id,
          insight_type: 'suggestion',
          title: idea.title,
          content: `カテゴリ: ${idea.category}\n緊急度: medium\n\n${idea.description}\n\nアプローチ: ${idea.approach}\n\n【根拠】\n${evidenceText}`,
          estimated_cost: { time: idea.estimated_cost.time, money: idea.estimated_cost.money },
          auto_proceed: idea.auto_proceed,
          status: idea.auto_proceed ? 'in_progress' : 'pending',
        })
        .select()
        .single();

      if (!error && insight) {
        savedIdeas.push({
          ...insight,
          needs_decomposition: scale.needs_decomposition,
          estimated_task_count: scale.estimated_task_count,
          cost_estimate: costEstimate,
        });
      }
    }

    return NextResponse.json({
      ideas: savedIdeas,
      total_generated: ideas.length,
      sources,
      cost: {
        actual: estimatedCost,
        limit: costLimit ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Idea generation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
