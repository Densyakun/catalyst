import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { listResources, createResource, type CreateResourceInput } from '@/lib/agent-tools';

/**
 * エージェント/MCP向けのリソースAPI。
 * GET  /api/agent/resources?limit=50
 * POST /api/agent/resources
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || 50);
    const resources = await listResources(supabase, auth.userId, { limit });
    return NextResponse.json({ resources });
  } catch (error: unknown) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = (await req.json()) as CreateResourceInput;
    const resource = await createResource(supabase, auth.userId, body);
    return NextResponse.json({ ok: true, resource });
  } catch (error: unknown) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes('required') || message.includes('Invalid') ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
