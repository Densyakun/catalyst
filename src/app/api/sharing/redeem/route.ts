import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { redeemShare, SharingError } from '@/lib/sharing/service';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { code?: unknown };
    const code = typeof body.code === 'string' ? body.code : '';
    const admin = createAdminClient();
    const result = await redeemShare(admin, user.id, code);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof SharingError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error('Share redeem error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
