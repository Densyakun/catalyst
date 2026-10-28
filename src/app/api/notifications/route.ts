import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { isValuableNotification, normalizeNotificationLink } from '@/lib/notifications';

/**
 * GET /api/notifications  → 自分の通知一覧（新しい順）
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;

    const rows = data || [];
    const proposalIds = Array.from(
      new Set(rows.map((n) => n.proposal_id).filter((id): id is string => Boolean(id))),
    );

    const proposalMap = new Map<
      string,
      { github_issue_url: string | null; rationale: string | null; proposed_change: string | null }
    >();
    if (proposalIds.length > 0) {
      const { data: proposals } = await supabase
        .from('evolution_proposals')
        .select('id, github_issue_url, rationale, proposed_change')
        .in('id', proposalIds);
      for (const p of proposals || []) {
        proposalMap.set(p.id, {
          github_issue_url: p.github_issue_url ?? null,
          rationale: p.rationale ?? null,
          proposed_change: p.proposed_change ?? null,
        });
      }
    }

    const enriched = rows.map((n) => {
      const proposal = n.proposal_id ? proposalMap.get(n.proposal_id) : undefined;
      const detail =
        n.detail ??
        [n.body, proposal?.rationale ? `理由: ${proposal.rationale}` : '', proposal?.proposed_change ? `変更内容: ${proposal.proposed_change}` : '']
          .filter(Boolean)
          .join('\n\n');
      return {
        ...n,
        detail: detail || null,
        link_url:
          normalizeNotificationLink(n.link_url) ??
          normalizeNotificationLink(proposal?.github_issue_url),
      };
    }).filter((n) =>
      isValuableNotification({
        title: n.title,
        body: n.body,
        detail: n.detail,
        linkUrl: n.link_url,
      }),
    );

    return NextResponse.json(enriched);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Notifications fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications  → 全件を既読にする
 */
export async function PATCH() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Notifications update error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
