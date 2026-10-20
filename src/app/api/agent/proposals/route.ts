import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { createProposal, listProposals, type CreateProposalInput } from '@/lib/agent-tools';
import type { ProposalStatus } from '@/lib/types/evolution';

/**
 * エージェント/MCP向けの改善提案API。
 * GET  /api/agent/proposals?status=proposed
 * POST /api/agent/proposals
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);
    const status = (url.searchParams.get('status') || 'proposed') as ProposalStatus;
    const proposals = await listProposals(supabase, auth.userId, status);
    return NextResponse.json({ proposals });
  } catch (error: unknown) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = (await req.json()) as CreateProposalInput;
    const proposal = await createProposal(supabase, auth.userId, body);
    return NextResponse.json({ ok: true, proposal });
  } catch (error: unknown) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes('required') || message.includes('Invalid') ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
