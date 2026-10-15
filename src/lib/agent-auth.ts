import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { hashApiToken } from '@/lib/api-tokens';

/**
 * エージェント/MCP連携の認証。
 * ユーザーがアプリ内で発行した APIトークン（cat_...）のみを受け付ける。
 * 認証OKなら { userId }、NGなら NextResponse（エラー）を返す。
 */
export type AgentAuth = { userId: string };

export async function resolveAgentAuth(req: Request): Promise<AgentAuth | NextResponse> {
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('user_api_tokens')
    .select('id, user_id, revoked_at')
    .eq('token_hash', hashApiToken(token))
    .maybeSingle();

  if (error || !data || data.revoked_at) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 最終使用時刻を更新（best effort）
  void supabase
    .from('user_api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return { userId: data.user_id as string };
}
