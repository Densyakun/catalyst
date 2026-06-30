import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { analyzeChatMessage } from '@/lib/ai/agents/chat-analyzer';
import { logCost } from '@/lib/cost/model';
import type { ChatMessage } from '@/lib/types/engine';

/**
 * GET: 会話一覧を取得
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, messages, extracted_tags, is_archived, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: メッセージを送信（新規会話 or 既存会話に追加）
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversation_id, message, editing_insight_id, editing_insight_title, editing_insight_content, source_names } = await req.json();

    // 既存の会話を取得 or 新規作成
    let conversationId = conversation_id;
    let existingMessages: ChatMessage[] = [];

    if (conversationId) {
      const { data: conv, error } = await supabase
        .from('conversations')
        .select('messages')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();

      if (error || !conv) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
      existingMessages = (conv.messages as ChatMessage[]) || [];
    }

    // ユーザーメッセージを追加
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    // 既存の課題・リソースを取得（重複排除用）
    const [problemsResult, resourcesResult] = await Promise.all([
      supabase
        .from('problems')
        .select('context')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('user_resources')
        .select('name, description')
        .eq('user_id', user.id)
        .limit(10),
    ]);

    const existingProblems = (problemsResult.data || []).map((p) => p.context);
    const existingResources = (resourcesResult.data || []).map((r) => `${r.name}: ${r.description || ''}`);

    // 編集中インサイトのコンテキスト
    const editingInsight = editing_insight_id
      ? { id: editing_insight_id, title: editing_insight_title || '', content: editing_insight_content || '' }
      : null;

    // AI分析
    const analysis = await analyzeChatMessage(
      existingMessages,
      message,
      existingProblems,
      existingResources,
      editingInsight,
      source_names || [],
    );

    // AIの返答メッセージ
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: analysis.reply,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...existingMessages, userMessage, assistantMessage];

    // 抽出された課題を保存
    for (const problem of analysis.extracted_items.problems) {
      await supabase.from('auto_insights').insert({
        user_id: user.id,
        insight_type: 'detected_problem',
        title: problem.description,
        content: `カテゴリ: ${problem.category}\n緊急度: ${problem.urgency}\n\nチャットから検出`,
        estimated_cost: { time: '未推定', money: 0 },
        auto_proceed: false,
        status: 'pending',
      });
    }

    // 抽出されたリソースを保存
    for (const resource of analysis.extracted_items.resources) {
      const validTypes = ['time', 'money', 'skill', 'tool', 'connection'];
      const resourceType = validTypes.includes(resource.type) ? resource.type : 'tool';

      await supabase.from('user_resources').insert({
        user_id: user.id,
        resource_type: resourceType,
        name: resource.name,
        description: resource.description,
      });
    }

    // 会話を保存
    if (conversationId) {
      await supabase
        .from('conversations')
        .update({
          messages: updatedMessages,
          title: analysis.suggested_title || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    } else {
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: analysis.suggested_title,
          messages: updatedMessages,
        })
        .select('id')
        .single();

      if (error) throw error;
      conversationId = newConv.id;
    }

    // インサイト修正
    let insightUpdated = false;
    if (editing_insight_id && analysis.insight_update) {
      const { error: updateError } = await supabase
        .from('auto_insights')
        .update({
          title: analysis.insight_update.title,
          content: analysis.insight_update.content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing_insight_id)
        .eq('user_id', user.id);

      if (!updateError) {
        insightUpdated = true;
      }
    }

    // ドキュメント再調査
    let reinvestigateResult: string | null = null;
    if (analysis.reinvestigate_keywords.length > 0) {
      try {
        const collectRes = await fetch(new URL('/api/sources/auto-collect', req.url).toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: req.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            mode: 'keyword',
            query: analysis.reinvestigate_keywords.join(' '),
          }),
        });
        if (collectRes.ok) {
          const collectData = await collectRes.json();
          reinvestigateResult = collectData.message || `${analysis.reinvestigate_keywords.join(', ')} で再調査しました`;
        }
      } catch (err) {
        console.error('Reinvestigate error:', err);
      }
    }

    // ソース操作
    let sourceActionResult: string | null = null;
    let sourcesChanged = false;
    if (analysis.source_action) {
      const action = analysis.source_action;
      try {
        if (action.type === 'import_keyword' && action.keywords.length > 0) {
          const collectRes = await fetch(new URL('/api/sources/auto-collect', req.url).toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: req.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              mode: 'keyword',
              query: action.keywords.join(' '),
            }),
          });
          if (collectRes.ok) {
            const collectData = await collectRes.json();
            sourceActionResult = collectData.message || `${action.keywords.join(', ')} でドキュメントを検索しました`;
            sourcesChanged = true;
          } else {
            const errData = await collectRes.json();
            sourceActionResult = errData.error === 're_auth_required'
              ? 'Google認証の有効期限が切れています。ソースパネルから再連携してください。'
              : `ドキュメント検索に失敗しました: ${errData.error || '不明なエラー'}`;
          }
        } else if (action.type === 'import_all') {
          const collectRes = await fetch(new URL('/api/sources/auto-collect', req.url).toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: req.headers.get('cookie') || '',
            },
            body: JSON.stringify({ mode: 'all' }),
          });
          if (collectRes.ok) {
            const collectData = await collectRes.json();
            sourceActionResult = collectData.message || '全件ドキュメントを取り込みました';
            sourcesChanged = true;
          } else {
            const errData = await collectRes.json();
            sourceActionResult = errData.error === 're_auth_required'
              ? 'Google認証の有効期限が切れています。ソースパネルから再連携してください。'
              : `全件取り込みに失敗しました: ${errData.error || '不明なエラー'}`;
          }
        } else if (action.type === 'process') {
          // 登録済みソースの内容を取得して、プロンプトで処理
          const targetNames = action.keywords;
          let query = supabase
            .from('user_sources')
            .select('id, source_name')
            .eq('user_id', user.id);

          if (targetNames.length > 0) {
            // 指定ソース名でフィルタ（部分一致）
            const orConditions = targetNames.map((name) => `source_name.ilike.%${name}%`).join(',');
            query = query.or(orConditions);
          }

          const { data: targetSources } = await query;

          if (!targetSources || targetSources.length === 0) {
            sourceActionResult = targetNames.length > 0
              ? `「${targetNames.join(', ')}」に一致するソースが見つかりませんでした`
              : '登録済みのソースがありません。まずドキュメントを追加してください。';
          } else {
            // 各ソースの最新スナップショットを取得
            const sourceIds = targetSources.map((s) => s.id);
            const { data: snapshots } = await supabase
              .from('source_snapshots')
              .select('source_id, summary, extracted_intents')
              .in('source_id', sourceIds)
              .order('created_at', { ascending: false });

            // source_id ごとに最新1件だけ使う
            const latestSnapshots = new Map<string, { summary: string; extracted_intents: unknown[] }>();
            for (const snap of snapshots || []) {
              if (!latestSnapshots.has(snap.source_id)) {
                latestSnapshots.set(snap.source_id, {
                  summary: snap.summary || '',
                  extracted_intents: (snap.extracted_intents as unknown[]) || [],
                });
              }
            }

            // ソース内容をコンテキストにまとめる
            const sourceContext = targetSources.map((s) => {
              const snap = latestSnapshots.get(s.id);
              if (!snap) return `【${s.source_name}】\n（未同期）`;
              return `【${s.source_name}】\n要約: ${snap.summary}\n検出事項: ${JSON.stringify(snap.extracted_intents)}`;
            }).join('\n\n');

            // AIにプロンプトとソースコンテキストを渡して処理
            const { generateObjectForRole } = await import('@/lib/ai/call');
            const { z } = await import('zod');

            const { object: processResult } = await generateObjectForRole<{ result: string; insights: { title: string; content: string }[] }>('structuring', {
              schema: z.object({
                result: z.string().describe('処理結果のテキスト'),
                insights: z.array(z.object({
                  title: z.string(),
                  content: z.string(),
                })).describe('抽出されたインサイト（課題・要点など）'),
              }),
              prompt: `以下のドキュメントソースに対して、ユーザーの指示に従って処理せよ。

【ユーザーの指示】
${action.prompt || '内容をまとめてください'}

【ソース内容】
${sourceContext}

簡潔に結果をまとめ、重要なインサイトがあれば抽出せよ。`,
            });

            // 抽出されたインサイトを保存
            for (const insight of processResult.insights) {
              await supabase.from('auto_insights').insert({
                user_id: user.id,
                insight_type: 'detected_problem',
                title: insight.title,
                content: `${insight.content}\n\nソース処理から検出`,
                estimated_cost: { time: '未推定', money: 0 },
                auto_proceed: false,
                status: 'pending',
              });
            }

            sourceActionResult = processResult.result;
            if (processResult.insights.length > 0) {
              sourceActionResult += `\n\n${processResult.insights.length}件のインサイトを新たに検出しました。`;
            }
          }
        }
      } catch (err) {
        console.error('Source action error:', err);
        sourceActionResult = 'ソース操作中にエラーが発生しました';
      }
    }

    // コストログ
    await logCost({
      userId: user.id,
      operationType: 'scoring',
      actualCost: 0.5,
    });

    return NextResponse.json({
      conversation_id: conversationId,
      reply: assistantMessage,
      extracted_items: analysis.extracted_items,
      insight_updated: insightUpdated,
      reinvestigate_result: reinvestigateResult,
      source_action_result: sourceActionResult,
      sources_changed: sourcesChanged,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Chat error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
