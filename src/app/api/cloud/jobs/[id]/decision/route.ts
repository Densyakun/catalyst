import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';
import { getCloudConfig } from '@/lib/cloud/config';
import { stopCodespace } from '@/lib/cloud/github';

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
    if (!isAdminUser(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: job } = await admin
      .from('cloud_jobs')
      .select('id, status, metadata, codespace_name')
      .eq('id', id)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const metadata = (job.metadata as Record<string, unknown> | null) || {};
    const now = new Date().toISOString();

    if (action === 'approve') {
      if (job.status !== 'blocked' || metadata.blocked_stage !== 'precheck') {
        return NextResponse.json(
          { error: 'この作業は事前承認の対象ではありません' },
          { status: 400 },
        );
      }

      const { data: updated, error } = await admin
        .from('cloud_jobs')
        .update({
          status: 'queued',
          error: null,
          metadata: {
            ...metadata,
            human_approved: true,
            approved_by: user.id,
            approved_at: now,
          },
        })
        .eq('id', id)
        .eq('status', 'blocked')
        .select()
        .maybeSingle();
      if (error) throw error;

      return NextResponse.json({ ok: true, job: updated });
    }

    if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(String(job.status))) {
      return NextResponse.json({ error: 'この作業はすでに終了しています' }, { status: 400 });
    }

    const { data: updated, error } = await admin
      .from('cloud_jobs')
      .update({
        status: 'cancelled',
        error: '管理者により却下されました',
        finished_at: now,
        payment_status: 'free',
        metadata: {
          ...metadata,
          rejected_by: user.id,
          rejected_at: now,
        },
      })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;

    const config = getCloudConfig();
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
    if (job.codespace_name && config.githubToken) {
      try {
        await stopCodespace(config.githubToken, String(job.codespace_name));
      } catch (stopError) {
        console.error('Decision stop codespace error:', stopError);
      }
    }

    return NextResponse.json({ ok: true, job: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud job decision error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
