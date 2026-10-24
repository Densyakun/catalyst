import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { ShareEvent } from '@/lib/types/sharing';

/**
 * GET /api/sharing/events
 * 自分が所有する共有、または自分が実行した共有イベントの監査ログ。
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: ownedShares } = await supabase
      .from('resource_shares')
      .select('id')
      .eq('owner_id', user.id);

    const shareIds = (ownedShares || []).map((share) => share.id as string);

    const [ownedEventsRes, actorEventsRes] = await Promise.all([
      shareIds.length > 0
        ? supabase
            .from('resource_share_events')
            .select('*')
            .in('share_id', shareIds)
            .order('created_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
      supabase
        .from('resource_share_events')
        .select('*')
        .eq('actor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const merged = new Map<string, ShareEvent>();
    for (const event of [
      ...((ownedEventsRes.data || []) as ShareEvent[]),
      ...((actorEventsRes.data || []) as ShareEvent[]),
    ]) {
      merged.set(event.id, event);
    }

    const events = [...merged.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    return NextResponse.json(events);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Share events fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
