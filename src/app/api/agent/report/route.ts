import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { reportResult } from '@/lib/agent-tools';
import type { AgentReportRequest } from '@/lib/types/evolution';

/**
 * エージェントの実行結果をKatalyseへ報告する（REST API）。
 * 認証したトークンのユーザーの提案のみ更新できる。
 *
 * POST /api/agent/report
 * body: { proposal_id, state?, issue_number?, issue_url?, repo?, pr_url?, summary?, detail?, notify? }
 *
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = (await req.json()) as AgentReportRequest;
    const updated = await reportResult(supabase, auth.userId, body);
    return NextResponse.json({ ok: true, proposal: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent report error:', error);
    const status =
      message === 'proposal not found' ? 404 :
      message === 'proposal_id is required' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
