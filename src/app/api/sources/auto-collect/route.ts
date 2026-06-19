import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAuthenticatedClient } from '@/lib/google/oauth';
import { listDocs, fetchDocContent } from '@/lib/google/docs';
import { extractIntents, estimateInsightCost } from '@/lib/ai/agents/proactive';
import { createHash } from 'crypto';

/**
 * 自動ドキュメント収集エンドポイント
 * AIがGoogle Driveを検索し、関連ドキュメントを自動追加+同期
 *
 * POST /api/sources/auto-collect
 * body: { mode: 'all' | 'keyword', query?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { mode, query } = body as { mode: 'all' | 'keyword'; query?: string };

    // OAuthトークンを取得
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_oauth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Google account not connected' },
        { status: 400 },
      );
    }

    const auth = createAuthenticatedClient(
      tokenData.access_token,
      tokenData.refresh_token,
    );

    // Google Driveからドキュメントを検索
    const docs = await listDocs(auth, mode === 'keyword' ? query : undefined);

    if (docs.length === 0) {
      return NextResponse.json({
        added: 0,
        synced: 0,
        insights: [],
        message: 'ドキュメントが見つかりませんでした',
      });
    }

    // 既存ソースのdoc_idを取得（重複追加を防止）
    const { data: existingSources } = await supabase
      .from('user_sources')
      .select('id, source_config')
      .eq('user_id', user.id)
      .eq('source_type', 'google_docs');

    const existingDocMap = new Map<string, string>();
    for (const src of existingSources || []) {
      const config = src.source_config as { doc_id?: string };
      if (config?.doc_id) {
        existingDocMap.set(config.doc_id, src.id);
      }
    }

    // 既存の課題（重複排除用）
    const { data: existingProblems } = await supabase
      .from('problems')
      .select('context')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const existingContexts = (existingProblems || []).map((p) => p.context);

    let addedCount = 0;
    let syncedCount = 0;
    const allInsights: Array<Record<string, unknown>> = [];

    for (const doc of docs) {
      let sourceId = existingDocMap.get(doc.id);

      // 新規ドキュメントをソースとして追加
      if (!sourceId) {
        const { data: newSource, error: addError } = await supabase
          .from('user_sources')
          .insert({
            user_id: user.id,
            source_type: 'google_docs',
            source_name: doc.name,
            source_config: {
              doc_id: doc.id,
              doc_title: doc.name,
              doc_url: `https://docs.google.com/document/d/${doc.id}`,
            },
          })
          .select()
          .single();

        if (addError || !newSource) continue;
        sourceId = newSource.id;
        addedCount++;
      }

      // ドキュメント内容を取得して同期
      try {
        const { title, content } = await fetchDocContent(auth, doc.id);
        if (!content.trim()) continue;

        const contentHash = createHash('sha256').update(content).digest('hex');

        // AI分析
        const { summary, intents } = await extractIntents(content, existingContexts);

        // スナップショットを保存
        const { data: snapshot, error: snapError } = await supabase
          .from('source_snapshots')
          .insert({
            source_id: sourceId,
            content,
            summary,
            extracted_intents: intents,
            content_hash: contentHash,
          })
          .select()
          .single();

        if (snapError || !snapshot) continue;

        // ソースの最終同期時刻を更新
        await supabase
          .from('user_sources')
          .update({
            last_synced_at: new Date().toISOString(),
            source_config: {
              doc_id: doc.id,
              doc_title: title,
              doc_url: `https://docs.google.com/document/d/${doc.id}`,
            },
          })
          .eq('id', sourceId);

        // インサイトを生成
        for (const intent of intents) {
          const cost = await estimateInsightCost(intent.description);

          const { data: insight } = await supabase
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

          if (insight) allInsights.push(insight);
        }

        syncedCount++;
      } catch (docError) {
        console.error(`Failed to sync doc ${doc.id}:`, docError);
      }
    }

    return NextResponse.json({
      added: addedCount,
      synced: syncedCount,
      insights: allInsights,
      message: `${docs.length}件のドキュメントを検索し、${addedCount}件を新規追加、${syncedCount}件を同期しました`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Auto-collect error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
