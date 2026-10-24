import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { revokeShare, SharingError } from '@/lib/sharing/service';

/**
 * PATCH /api/sharing/[id]
 * 共有を取消す。未使用の資金は所有者へ返金する。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { status?: unknown };
    if (body.status !== 'revoked') {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    const admin = createAdminClient();
    const share = await revokeShare(admin, user.id, id);
    return NextResponse.json(share);
  } catch (error) {
    const status = error instanceof SharingError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error('Share revoke error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
