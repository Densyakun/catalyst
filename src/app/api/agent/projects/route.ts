import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { listProjects, createProject, type CreateProjectInput } from '@/lib/agent-tools';

/**
 * エージェント/MCP向けのプロジェクトAPI。
 * GET  /api/agent/projects?with_tasks=1&limit=50
 * POST /api/agent/projects
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || 50);
    const withTasks = url.searchParams.get('with_tasks') === '1';
    const projects = await listProjects(supabase, auth.userId, { limit, withTasks });
    return NextResponse.json({ projects });
  } catch (error: unknown) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = (await req.json()) as CreateProjectInput;
    const project = await createProject(supabase, auth.userId, body);
    return NextResponse.json({ ok: true, project });
  } catch (error: unknown) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes('required') ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
