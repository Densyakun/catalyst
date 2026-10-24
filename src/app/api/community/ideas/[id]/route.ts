import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { notifyUser } from '@/lib/notifications';
import type { SharedIdeaStatus } from '@/lib/types/community';

const ALLOWED: SharedIdeaStatus[] = ['open', 'in_progress', 'completed', 'closed'];

export async function PATCH(
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

    const body = await req.json() as { status?: unknown };
    const status = typeof body.status === 'string' && ALLOWED.includes(body.status as SharedIdeaStatus)
      ? body.status as SharedIdeaStatus
      : null;
    if (!status) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('shared_ideas')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', user.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (status === 'completed' || status === 'closed') {
      try {
        const admin = createAdminClient();
        const { data: supporters } = await admin
          .from('shared_idea_supporters')
          .select('user_id')
          .eq('shared_idea_id', id);
        const notified = new Set<string>();
        for (const supporter of supporters || []) {
          if (supporter.user_id === user.id || notified.has(supporter.user_id)) continue;
          notified.add(supporter.user_id);
          await notifyUser(admin, {
            userId: supporter.user_id,
            title: status === 'completed' ? '支援したアイデアが完了しました' : '支援したアイデアが終了しました',
            body: String(data.title ?? ''),
            kind: 'info',
          });
        }
      } catch (notifyError) {
        console.error('Supporter notification error:', notifyError);
      }
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Community idea update error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
