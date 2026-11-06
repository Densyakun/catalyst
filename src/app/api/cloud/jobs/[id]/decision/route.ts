import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';
import { requeueCloudJob, startCloudJobById } from '@/lib/cloud/jobs';

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
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 4000) : '';

    const admin = createAdminClient();
    const { data: job } = await admin
      .from('cloud_jobs')
      .select('id, status, metadata, codespace_name, prompt')
      .eq('id', id)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const metadata = (job.metadata as Record<string, unknown> | null) || {};
    const now = new Date().toISOString();

    if (action === 'approve') {
      if (job.status !== 'blocked') {
        return NextResponse.json({ error: 'この作業は承認待ちではありません' }, { status: 400 });
      }

      const stage = metadata.blocked_stage;

      if (stage === 'diff') {
        // 作業環境は毎回作り直されるため、承認時は保存済みの変更内容と追加の指示を
        // 引き継いで最初から再実行する。
        const requeued = await requeueCloudJob(id, user.id, {
          fromBlockedDiff: true,
          appendPrompt: note,
          actorNote: note,
          humanApprove: true,
        });
        if (!requeued.ok) {
          const message = requeued.reason === 'duplicate'
            ? '同じ課題の作業がすでに実行中・完了済みです'
            : 'この作業は再実行できません';
          return NextResponse.json({ error: message }, { status: 400 });
        }

        const dispatch = await startCloudJobById(id, req.nextUrl.origin).catch((dispatchError) => ({
          ok: false,
          runnerId: null,
          error: dispatchError instanceof Error ? dispatchError.message : String(dispatchError),
        }));
        const { data: refreshed } = await admin
          .from('cloud_jobs')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        return NextResponse.json({
          ok: true,
          job: refreshed ?? requeued.job,
          started: dispatch.ok,
          dispatch_error: dispatch.ok ? null : dispatch.error,
          rerun: true,
        });
      }

      if (stage !== 'precheck') {
        return NextResponse.json(
          { error: 'この作業は事前承認の対象ではありません' },
          { status: 400 },
        );
      }

      const feedbackHistory = Array.isArray(metadata.feedback_history)
        ? metadata.feedback_history.slice(-9)
        : [];
      if (note) {
        feedbackHistory.push({ at: now, by: user.id, note });
      }
      const approvedMetadata: Record<string, unknown> = {
        ...metadata,
        human_approved: true,
        approved_by: user.id,
        approved_at: now,
      };
      if (feedbackHistory.length > 0) approvedMetadata.feedback_history = feedbackHistory;

      const { data: updated, error } = await admin
        .from('cloud_jobs')
        .update({
          status: 'queued',
          error: null,
          ...(note && job.prompt
            ? { prompt: `${String(job.prompt)}\n\n追加の指示（再実行時）:\n${note}` }
            : {}),
          metadata: approvedMetadata,
        })
        .eq('id', id)
        .eq('status', 'blocked')
        .select()
        .maybeSingle();
      if (error) throw error;

      const dispatch = await startCloudJobById(id, req.nextUrl.origin).catch((dispatchError) => ({
        ok: false,
        runnerId: null,
        error: dispatchError instanceof Error ? dispatchError.message : String(dispatchError),
      }));
      const { data: refreshed } = await admin
        .from('cloud_jobs')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        job: refreshed ?? updated,
        started: dispatch.ok,
        dispatch_error: dispatch.ok ? null : dispatch.error,
      });
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

    return NextResponse.json({ ok: true, job: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud job decision error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
