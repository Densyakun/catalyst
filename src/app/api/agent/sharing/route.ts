import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { createShare, listShares, SharingError } from '@/lib/sharing/service';
import type { ShareType } from '@/lib/types/sharing';

/**
 * エージェント/MCP向け共有API。
 * GET  /api/agent/sharing
 * POST /api/agent/sharing
 * 認証: Authorization: Bearer <ユーザーAPIトークン>
 */
export async function GET(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const admin = createAdminClient();
    const snapshot = await listShares(admin, auth.userId);
    return NextResponse.json(snapshot);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json() as Record<string, unknown>;
    const admin = createAdminClient();
    const result = await createShare(admin, auth.userId, {
      share_type: typeof body.share_type === 'string' ? body.share_type as ShareType : 'resource',
      title: typeof body.title === 'string' ? body.title : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      resource_id: typeof body.resource_id === 'string' ? body.resource_id : null,
      purpose_id: typeof body.purpose_id === 'string' ? body.purpose_id : null,
      shared_idea_id: typeof body.shared_idea_id === 'string' ? body.shared_idea_id : null,
      amount_limit: typeof body.amount_limit === 'number' || typeof body.amount_limit === 'string'
        ? Number(body.amount_limit)
        : 0,
      permissions: Array.isArray(body.permissions)
        ? body.permissions.filter((permission): permission is string => typeof permission === 'string')
        : undefined,
      max_uses: typeof body.max_uses === 'number' || typeof body.max_uses === 'string'
        ? Number(body.max_uses)
        : 0,
      expires_at: typeof body.expires_at === 'string' && body.expires_at ? body.expires_at : null,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  const status = error instanceof SharingError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  console.error('Agent sharing error:', error);
  return NextResponse.json({ error: message }, { status });
}
