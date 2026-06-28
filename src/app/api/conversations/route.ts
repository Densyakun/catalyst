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

    const { conversation_id, message } = await req.json();

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

    // AI分析
    const analysis = await analyzeChatMessage(
      existingMessages,
      message,
      existingProblems,
      existingResources,
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Chat error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
