import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';
import { startCloudJobById } from '@/lib/cloud/jobs';

export async function POST(
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

    const admin = createAdminClient();
    const { data: job } = await admin
      .from('cloud_jobs')
      .select('id, user_id, status')
      .eq('id', id)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isAdmin = isAdminUser(user);
    if (job.user_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (job.status !== 'queued') {
      return NextResponse.json({ error: 'この作業は実行待ちではありません' }, { status: 400 });
    }

    const result = await startCloudJobById(id, req.nextUrl.origin);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || '実行を開始できませんでした' },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, runner_id: result.runnerId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud job start error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
