import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';
import { getCloudConfig, isCloudConfigured } from '@/lib/cloud/config';
import { toCloudJob } from '@/lib/cloud/jobs';
import { getUserBalance } from '@/lib/cost/model';
import type { CloudOverview } from '@/lib/types/cloud';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = isAdminUser(user);
    const config = getCloudConfig();
    const balance = await getUserBalance(user.id);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { count: dailyUsed } = await supabase
      .from('cloud_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', 'user_task')
      .gte('created_at', startOfDay.toISOString());

    const store = isAdmin ? createAdminClient() : supabase;
    let query = store
      .from('cloud_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!isAdmin) query = query.eq('user_id', user.id);

    const { data: jobs, error } = await query;
    if (error) throw error;

    const payload: CloudOverview = {
      is_admin: isAdmin,
      available: isCloudConfigured(),
      user_balance: balance,
      estimated_credits: config.estimateCredits,
      credit_per_minute: config.creditPerMinute,
      daily_limit: config.dailyLimit,
      daily_used: dailyUsed ?? 0,
      auto_enabled: isAdmin ? config.autoEnabled : false,
      auto_repo: isAdmin ? config.repo || null : null,
      max_concurrent: isAdmin ? config.maxConcurrent : 0,
      jobs: (jobs || []).map((job) => toCloudJob(job, isAdmin)),
      message: isCloudConfigured()
        ? undefined
        : 'クラウド作業は現在準備中です。管理者が環境を設定すると利用できます。',
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud overview error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
