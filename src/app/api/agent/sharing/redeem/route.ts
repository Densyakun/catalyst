import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { redeemShare, SharingError } from '@/lib/sharing/service';

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json() as { code?: unknown };
    const admin = createAdminClient();
    const result = await redeemShare(
      admin,
      auth.userId,
      typeof body.code === 'string' ? body.code : '',
    );
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof SharingError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent share redeem error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
