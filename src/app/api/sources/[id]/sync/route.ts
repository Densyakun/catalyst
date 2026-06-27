import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getAuthClientForUser } from '@/lib/google/oauth';
import { fetchDocContent, writeDocContent } from '@/lib/google/docs';
import { extractIntents, generateMemoRewrite, estimateInsightCost } from '@/lib/ai/agents/proactive';
import { createHash } from 'crypto';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ソース情報を取得
    const { data: source, error: srcError } = await supabase
      .from('user_sources')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (srcError || !source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const authResult = await getAuthClientForUser(supabase, user.id);
    if (authResult.error === 'not_connected') {
      return NextResponse.json({ error: 'Google account not connected' }, { status: 400 });
    }
    if (authResult.error === 're_auth_required') {
      return NextResponse.json({ error: 're_auth_required' }, { status: 401 });
    }
    const auth = authResult.auth;

    const config = source.source_config as { doc_id: string };
    const { title, content } = await fetchDocContent(auth, config.doc_id);

    // 変更検出
    const contentHash = createHash('sha256').update(content).digest('hex');

    const { data: lastSnapshot } = await supabase
      .from('source_snapshots')
      .select('content_hash')
      .eq('source_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const hasChanged = !lastSnapshot || lastSnapshot.content_hash !== contentHash;

    // 既存の課題を取得（重複排除用）
    const { data: existingProblems } = await supabase
      .from('problems')
      .select('context')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const existingContexts = (existingProblems || []).map((p) => p.context);

    // AI分析
    const { summary, intents } = await extractIntents(content, existingContexts);

    // スナップショットを保存
    const { data: snapshot, error: snapError } = await supabase
      .from('source_snapshots')
      .insert({
        source_id: id,
        content,
        summary,
        extracted_intents: intents,
        content_hash: contentHash,
      })
      .select()
      .single();

    if (snapError) throw snapError;

    // ソースの最終同期時刻を更新
    await supabase
      .from('user_sources')
      .update({
        last_synced_at: new Date().toISOString(),
        source_config: { ...config, doc_title: title },
      })
      .eq('id', id);

    // 検出された意図からインサイトを生成
    const insights = [];
    for (const intent of intents) {
      const cost = await estimateInsightCost(intent.description);

      const { data: insight, error: insError } = await supabase
        .from('auto_insights')
        .insert({
          user_id: user.id,
          source_snapshot_id: snapshot.id,
          insight_type: 'detected_problem',
          title: intent.description,
          content: `カテゴリ: ${intent.category}\n緊急度: ${intent.urgency}\n\n関連テキスト:\n${intent.related_text}`,
          estimated_cost: { time: cost.time, money: cost.money },
          auto_proceed: cost.auto_proceed,
          status: cost.auto_proceed ? 'in_progress' : 'pending',
        })
        .select()
        .single();

      if (!insError && insight) {
        insights.push(insight);
      }
    }

    // メモの整理提案を生成（変更があった場合のみ）
    let memoRewrite = null;
    if (hasChanged && content.length > 50) {
      const diffData = await generateMemoRewrite(content);

      const { data: rewriteInsight } = await supabase
        .from('auto_insights')
        .insert({
          user_id: user.id,
          source_snapshot_id: snapshot.id,
          insight_type: 'memo_rewrite',
          title: `「${title}」の整理提案`,
          content: `${diffData.changes.filter((c) => c.type !== 'unchanged').length}箇所の変更を提案します`,
          diff_data: diffData,
          estimated_cost: { time: '1分', money: 0 },
          auto_proceed: false,
          status: 'pending',
        })
        .select()
        .single();

      memoRewrite = rewriteInsight;
    }

    return NextResponse.json({
      snapshot: {
        id: snapshot.id,
        summary,
        intents,
        has_changed: hasChanged,
      },
      insights,
      memo_rewrite: memoRewrite,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Sync error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * メモ書き換えの実行（diff適用後）
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { new_content, insight_id } = await req.json();

    // ソース情報を取得
    const { data: source, error: srcError } = await supabase
      .from('user_sources')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (srcError || !source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const authResult = await getAuthClientForUser(supabase, user.id);
    if (authResult.error === 'not_connected') {
      return NextResponse.json({ error: 'Google account not connected' }, { status: 400 });
    }
    if (authResult.error === 're_auth_required') {
      return NextResponse.json({ error: 're_auth_required' }, { status: 401 });
    }
    const auth = authResult.auth;

    const config = source.source_config as { doc_id: string };
    await writeDocContent(auth, config.doc_id, new_content);

    // インサイトのステータスを更新
    if (insight_id) {
      await supabase
        .from('auto_insights')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', insight_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Write doc error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
