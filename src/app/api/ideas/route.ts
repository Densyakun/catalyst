import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateIdeas } from '@/lib/ai/agents/idea-generator';
import { assessScale } from '@/lib/ai/agents/decomposer';
import { logCost, estimateOperationCost, calculateCostEstimate } from '@/lib/cost/model';

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

    const { context } = await req.json();

    // 目星済みアイテムを取得
    const { data: markedItems } = await supabase
      .from('marked_items')
      .select('item_id, item_type, relevance_score')
      .eq('user_id', user.id)
      .order('relevance_score', { ascending: false });

    if (!markedItems || markedItems.length === 0) {
      return NextResponse.json({ error: '目星をつけたアイテムがありません。先に目星をつけてください。' }, { status: 400 });
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

    // アイデア生成
    const ideas = await generateIdeas(problems, resources, context);

    // コストログ
    await logCost({
      userId: user.id,
      operationType: 'idea_generation',
      actualCost: estimateOperationCost('idea_generation', 1),
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
          content: `カテゴリ: ${idea.category}\n緊急度: medium\n\n${idea.description}\n\nアプローチ: ${idea.approach}`,
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Idea generation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
