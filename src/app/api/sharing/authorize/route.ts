import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { authorizeShareUse, SharingError } from '@/lib/sharing/service';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      share_id?: unknown;
      action?: unknown;
      amount?: unknown;
    };
    const admin = createAdminClient();
    const result = await authorizeShareUse(admin, user.id, body);
    return NextResponse.json(result, { status: result.allowed ? 200 : 403 });
  } catch (error) {
    const status = error instanceof SharingError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error('Share authorize error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
