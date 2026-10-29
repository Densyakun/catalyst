import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';

export async function DELETE(
  _req: NextRequest,
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
      .select('id, user_id, status, codespace_name')
      .eq('id', id)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.user_id !== user.id && !isAdminUser(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!['queued', 'provisioning', 'running', 'blocked'].includes(String(job.status))) {
      return NextResponse.json({ error: 'この作業はすでに終了しています' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await admin
      .from('cloud_jobs')
      .update({
        status: 'cancelled',
        error: 'ユーザーによりキャンセルされました',
        finished_at: now,
        payment_status: 'free',
      })
      .eq('id', id);

    if (job.codespace_name) {
      await admin
        .from('cloud_sessions')
        .update({
          status: 'stopped',
          current_job_id: null,
          stopped_at: now,
          updated_at: now,
        })
        .eq('codespace_name', String(job.codespace_name));
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
