import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { processIdeaInbox } from '@/lib/ideas/process';

/**
 * エージェント/MCP向けのアイデア後処理API。
 * POST /api/agent/ideas/process
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const result = await processIdeaInbox(supabase, auth.userId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent idea inbox process error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
