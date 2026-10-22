import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { runEvolutionAnalysis } from '@/lib/evolution/run';

/**
 * エージェント/MCP向けの自己進化分析API。
 * POST /api/agent/evolution/analyze
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const result = await runEvolutionAnalysis(supabase, auth.userId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent evolution analyze error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
