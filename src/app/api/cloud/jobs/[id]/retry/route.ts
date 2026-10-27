import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';
import { isCloudJobRetryable, requeueCloudJob, toCloudJob } from '@/lib/cloud/jobs';

export async function POST(
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
    if (!isCloudJobRetryable(String(job.status))) {
      return NextResponse.json(
        { error: 'この作業は再実行できません（時間切れ・失敗・キャンセルのみ再実行できます）' },
        { status: 400 },
      );
    }

    const result = await requeueCloudJob(id, user.id);
    if (!result.ok) {
      if (result.reason === 'duplicate') {
        return NextResponse.json(
          { error: '同じ作業がすでに実行待ち・実行中・完了済みです' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: 'この作業は再実行できません（時間切れ・失敗・キャンセルのみ再実行できます）' },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, job: toCloudJob(result.job, isAdmin) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud job retry error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
