import { NextRequest, NextResponse } from 'next/server';
import { resolveAgentAuth } from '@/lib/agent-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { authorizeShareUse, SharingError } from '@/lib/sharing/service';

export async function POST(req: NextRequest) {
  const auth = await resolveAgentAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json() as {
      share_id?: unknown;
      action?: unknown;
      amount?: unknown;
    };
    const admin = createAdminClient();
    const result = await authorizeShareUse(admin, auth.userId, body);
    return NextResponse.json(result, { status: result.allowed ? 200 : 403 });
  } catch (error) {
    const status = error instanceof SharingError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error('Agent share authorize error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
