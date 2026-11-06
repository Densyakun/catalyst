import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminUser } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** 失敗・時間切れ・キャンセルで終わった履歴をまとめて削除する。 */
const DELETABLE_STATUSES = ['failed', 'timed_out', 'cancelled'] as const;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = isAdminUser(user);
    const admin = createAdminClient();
    let query = admin
      .from('cloud_jobs')
      .delete()
      .in('status', [...DELETABLE_STATUSES])
      .select('id');
    if (!isAdmin) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cloud jobs cleanup error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
