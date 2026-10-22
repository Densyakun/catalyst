import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { updateProposalStatus } from '@/lib/agent-tools';
import type { ProposalStatus } from '@/lib/types/evolution';

/**
 * エージェント/MCP向けの改善提案ステータス更新API。
 * PATCH /api/agent/proposals/[id]  body: { status }
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { status?: ProposalStatus };
    if (!body.status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }
    const supabase = createAdminClient();
    const proposal = await updateProposalStatus(supabase, auth.userId, id, body.status);
    return NextResponse.json({ ok: true, proposal });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('required') || message.includes('Invalid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
