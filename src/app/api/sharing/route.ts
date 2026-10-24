import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createShare, listShares, SharingError } from '@/lib/sharing/service';
import type { ShareType } from '@/lib/types/sharing';

function handleError(error: unknown) {
  const status = error instanceof SharingError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  console.error('Sharing API error:', error);
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET  /api/sharing  自分が共有したもの・受け取ったもの
 * POST /api/sharing  共有を作成（アクセスコードは発行時のみ返す）
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const snapshot = await listShares(admin, user.id);
    return NextResponse.json(snapshot);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      share_type?: unknown;
      title?: unknown;
      description?: unknown;
      resource_id?: unknown;
      purpose_id?: unknown;
      shared_idea_id?: unknown;
      amount_limit?: unknown;
      permissions?: unknown;
      max_uses?: unknown;
      expires_at?: unknown;
    };

    const shareType = typeof body.share_type === 'string' ? body.share_type as ShareType : 'resource';
    const admin = createAdminClient();
    const result = await createShare(admin, user.id, {
      share_type: shareType,
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
