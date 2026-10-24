import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateObjectForRole } from '@/lib/ai/call';
import { classifyLlmError } from '@/lib/ai/llm-log';
import { estimateOperationCost } from '@/lib/cost/model';
import type {
  IdeaInboxItem,
  ProcessIdeaInboxResult,
} from '@/lib/types/ideas';

const STALE_PROCESSING_MS = 10 * 60 * 1000;
const RETRY_BASE_MS = 60 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;

const enrichedIdeaSchema = z.object({
  title: z.string().max(100).describe('アイデアの簡潔なタイトル'),
  summary: z.string().describe('元のアイデアを保った要約'),
  category: z.string().describe('カテゴリ'),
  urgency: z.enum(['low', 'medium', 'high']).describe('緊急度'),
  approach: z.string().describe('実行可能なアプローチ'),
  estimated_cost: z.object({
    time: z.string().describe('推定所要時間'),
    money: z.number().describe('推定コスト（円）'),
  }),
  is_social: z.boolean().describe('社会的な便益があるか'),
  next_step: z.string().describe('最初に取るべき具体的な一歩'),
});

type EnrichedIdea = z.infer<typeof enrichedIdeaSchema>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeError(error: unknown): string {
  return getErrorMessage(error)
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
    .slice(0, 1000);
}

function getNextRetryAt(attempts: number): string {
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + delay).toISOString();
}

async function recoverStaleItems(supabase: SupabaseClient, userId: string): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  await supabase
    .from('idea_inbox')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'processing')
    .lt('updated_at', staleBefore);
}

async function claimItem(
  supabase: SupabaseClient,
  item: IdeaInboxItem,
): Promise<IdeaInboxItem | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('idea_inbox')
    .update({ status: 'processing', updated_at: now })
    .eq('id', item.id)
    .eq('user_id', item.user_id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  return (data as IdeaInboxItem | null) ?? null;
}

async function markProcessed(
  supabase: SupabaseClient,
  item: IdeaInboxItem,
  insightId: string,
): Promise<void> {
  await supabase
    .from('idea_inbox')
    .update({
      status: 'processed',
      attempts: item.attempts + 1,
      processed_insight_id: insightId,
      last_error: null,
      next_retry_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .eq('user_id', item.user_id);
}

async function markFailed(
  supabase: SupabaseClient,
  item: IdeaInboxItem,
  error: unknown,
): Promise<boolean> {
  const attempts = item.attempts + 1;
  const exhausted = attempts >= item.max_attempts;
  const errorType = classifyLlmError(error);

  await supabase
    .from('idea_inbox')
    .update({
      status: exhausted ? 'failed' : 'pending',
      attempts,
      last_error: `${errorType}: ${sanitizeError(error)}`,
      next_retry_at: exhausted ? null : getNextRetryAt(attempts),
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .eq('user_id', item.user_id);

  return exhausted;
}

async function enrichAndSave(
  supabase: SupabaseClient,
  item: IdeaInboxItem,
): Promise<string> {
  const { object } = await generateObjectForRole<EnrichedIdea>('structuring', {
    schema: enrichedIdeaSchema,
    prompt: `Katalyse アイデア後処理エージェント。ユーザーが後で処理するために保存したアイデアを、実行可能な提案に構造化せよ。

【原則】
- ユーザーの元の意図を変えない。内容を勝手に追加・削除しない
- 情報が足りない場合は、summary に「不足している情報」を明記する
- 見積もりは控えめにし、根拠のない楽観的な数字を出さない
- next_step は今日から実行できる具体的な一歩にする

【保存されたアイデア】
タイトル: ${item.title || '（未設定）'}
本文:
${item.content.slice(0, 6000)}
`,
    maxOutputTokens: 1500,
    context: {
      userId: item.user_id,
      agent: 'idea-inbox',
      operation: 'idea_inbox_processing',
      metadata: { inboxId: item.id },
    },
  });

  const content = [
    `カテゴリ: ${object.category}`,
    `緊急度: ${object.urgency}`,
    '',
    object.summary,
    '',
    `アプローチ: ${object.approach}`,
    `最初の一歩: ${object.next_step}`,
    '',
    '---',
    '元のアイデア:',
    item.content,
  ].join('\n');

  const { data: insight, error } = await supabase
    .from('auto_insights')
    .insert({
      user_id: item.user_id,
      insight_type: 'suggestion',
      title: object.title,
      content,
      estimated_cost: object.estimated_cost,
      auto_proceed: false,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !insight) {
    throw error ?? new Error('インサイトの保存に失敗しました');
  }

  try {
    await supabase.from('cost_log').insert({
      user_id: item.user_id,
      operation_type: 'idea_generation',
      layer: 2,
      input_item_ids: [item.id],
      actual_cost: estimateOperationCost('idea_generation', 1),
    });
  } catch {
    // コスト記録の失敗は処理結果を妨げない
  }

  return insight.id as string;
}

/**
 * 保存済みのアイデアを、LLM が使えるタイミングで構造化して auto_insights に移す。
 * 失敗時は指数バックオフで再試行し、上限に達したら failed にする。
 */
export async function processIdeaInbox(
  supabase: SupabaseClient,
  userId: string,
  limit = 3,
): Promise<ProcessIdeaInboxResult> {
  await recoverStaleItems(supabase, userId);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('idea_inbox')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('next_retry_at', now)
    .lte('scheduled_at', now)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  const items = (data || []) as IdeaInboxItem[];
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    const claimed = await claimItem(supabase, item);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    try {
      const insightId = await enrichAndSave(supabase, claimed);
      await markProcessed(supabase, claimed, insightId);
      processed += 1;
    } catch (processError) {
      const exhausted = await markFailed(supabase, claimed, processError);
      if (exhausted) failed += 1;
      errors.push(sanitizeError(processError));
    }
  }

  const { count } = await supabase
    .from('idea_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');

  return {
    processed,
    failed,
    skipped,
    remaining: count ?? 0,
    errors: errors.slice(0, 3),
  };
}
