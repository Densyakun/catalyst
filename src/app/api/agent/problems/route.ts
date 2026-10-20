import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { listProblems, createProblem, type CreateProblemInput } from '@/lib/agent-tools';

/**
 * エージェント/MCP向けの課題API。
 * GET  /api/agent/problems?status=unsolved&limit=50
 * POST /api/agent/problems
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const limit = Number(url.searchParams.get('limit') || 50);
    const problems = await listProblems(supabase, auth.userId, { status, limit });
    return NextResponse.json({ problems });
  } catch (error: unknown) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = (await req.json()) as CreateProblemInput;
    const problem = await createProblem(supabase, auth.userId, body);
    return NextResponse.json({ ok: true, problem });
  } catch (error: unknown) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes('required') ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
