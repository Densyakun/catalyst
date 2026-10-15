import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { listProposals, getProposalContext } from '@/lib/agent-tools';
import type { ProposalStatus } from '@/lib/types/evolution';

/**
 * エージェント向けREST API。
 * 認証したトークンのユーザーにスコープされる。
 *
 * GET /api/agent/context?status=approved
 * GET /api/agent/context?proposal_id=<uuid>
 *
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);
    const proposalId = url.searchParams.get('proposal_id');

    if (proposalId) {
      const context = await getProposalContext(supabase, auth.userId, proposalId);
      if (!context) {
        return NextResponse.json({ error: 'proposal not found' }, { status: 404 });
      }
      return NextResponse.json(context);
    }

    const status = (url.searchParams.get('status') || 'approved') as ProposalStatus;
    const proposals = await listProposals(supabase, auth.userId, status);
    return NextResponse.json({ proposals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent context error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
