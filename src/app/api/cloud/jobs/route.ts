import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';
import { getCloudConfig, isCloudConfigured } from '@/lib/cloud/config';
import { buildUserTaskPrompt, toCloudJob } from '@/lib/cloud/jobs';
import { redactSecrets, sanitizeCommitText } from '@/lib/cloud/security';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = isAdminUser(user);
    const store = isAdmin ? createAdminClient() : supabase;
    let query = store
      .from('cloud_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (!isAdmin) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ jobs: (data || []).map((job) => toCloudJob(job, isAdmin)) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isCloudConfigured()) {
      return NextResponse.json(
        { error: 'クラウド作業は現在準備中です。管理者が環境を設定すると利用できます。' },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === 'string' ? redactSecrets(sanitizeCommitText(body.title, 120)) : '';
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 8000) : '';

    if (title.length < 2) {
      return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 });
    }
    if (prompt.length < 5) {
      return NextResponse.json({ error: '依頼内容を入力してください' }, { status: 400 });
    }

    const config = getCloudConfig();
    const isAdmin = isAdminUser(user);
    if (!isAdmin) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('cloud_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('kind', 'user_task')
        .gte('created_at', startOfDay.toISOString());

      if ((count ?? 0) >= config.dailyLimit) {
        return NextResponse.json(
          { error: `1日に依頼できるクラウド作業は${config.dailyLimit}件までです` },
          { status: 429 },
        );
      }
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('cloud_jobs')
      .insert({
        user_id: user.id,
        kind: 'user_task',
        status: 'queued',
        source: 'user',
        title,
        prompt: buildUserTaskPrompt(title, prompt),
        repo: null,
        model: config.model,
        max_minutes: config.jobMaxMinutes,
        funded_by: 'user',
        credits_estimated: config.estimateCredits,
        metadata: { sandboxed: true },
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ job: toCloudJob(data, isAdmin) }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud job create error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
