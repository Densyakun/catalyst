import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { notifyUser } from '@/lib/notifications';
import type {
  SharedIdea,
  SharedIdeaSupporter,
  SupportType,
} from '@/lib/types/community';

const SUPPORT_TYPES: SupportType[] = ['money', 'time', 'skill'];

function normalizeSupportTypes(value: unknown): SupportType[] {
  if (!Array.isArray(value)) return SUPPORT_TYPES;
  const selected = value.filter(
    (item): item is SupportType => typeof item === 'string' && SUPPORT_TYPES.includes(item as SupportType),
  );
  return selected.length > 0 ? selected : SUPPORT_TYPES;
}

function parseNonNegativeAmount(value: unknown): number {
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : 0;
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

/**
 * GET  /api/community/ideas  共有アイデア一覧
 * POST /api/community/ideas  自分のインサイトを共有アイデアとして公開
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('shared_ideas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = data || [];
    const ids = rows.map((row) => row.id as string);
    const ownIds = rows.filter((row) => row.owner_id === user.id).map((row) => row.id as string);

    const mineMap = new Map<string, SupportType[]>();
    if (ids.length > 0) {
      const { data: mine } = await supabase
        .from('shared_idea_supporters')
        .select('shared_idea_id, support_type')
        .eq('user_id', user.id)
        .in('shared_idea_id', ids);
      for (const row of mine || []) {
        const list = mineMap.get(row.shared_idea_id) || [];
        list.push(row.support_type as SupportType);
        mineMap.set(row.shared_idea_id, list);
      }
    }

    const supportersMap = new Map<string, SharedIdeaSupporter[]>();
    if (ownIds.length > 0) {
      const { data: supporters } = await supabase
        .from('shared_idea_supporters')
        .select('*')
        .in('shared_idea_id', ownIds)
        .order('created_at', { ascending: false });
      for (const row of (supporters || []) as SharedIdeaSupporter[]) {
        const list = supportersMap.get(row.shared_idea_id) || [];
        list.push(row);
        supportersMap.set(row.shared_idea_id, list);
      }
    }

    const ideas: SharedIdea[] = rows.map((row) => ({
      ...(row as Omit<SharedIdea, 'is_owner' | 'supported_types' | 'supporters'>),
      is_owner: row.owner_id === user.id,
      supported_types: mineMap.get(row.id as string) || [],
      supporters: row.owner_id === user.id ? supportersMap.get(row.id as string) || [] : undefined,
    }));

    return NextResponse.json(ideas);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Community ideas fetch error:', error);
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

    const body = await req.json() as {
      insight_id?: unknown;
      summary?: unknown;
      category?: unknown;
      tags?: unknown;
      needed_support?: unknown;
      target_amount?: unknown;
    };
    const insightId = typeof body.insight_id === 'string' ? body.insight_id : '';
    if (!insightId) {
      return NextResponse.json({ error: '共有するアイデアを選択してください' }, { status: 400 });
    }

    const { data: insight } = await supabase
      .from('auto_insights')
      .select('id, title, content, insight_type')
      .eq('id', insightId)
      .eq('user_id', user.id)
      .eq('insight_type', 'suggestion')
      .maybeSingle();

    if (!insight) {
      return NextResponse.json({ error: 'アイデアが見つかりません' }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from('shared_ideas')
      .select('id')
      .eq('owner_id', user.id)
      .eq('insight_id', insightId)
      .neq('status', 'closed')
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'このアイデアはすでに共有されています' }, { status: 409 });
    }

    const targetAmount = parseNonNegativeAmount(body.target_amount);
    const neededSupport = normalizeSupportTypes(body.needed_support);
    const category = typeof body.category === 'string' ? body.category.trim() || null : null;
    const summary = typeof body.summary === 'string' && body.summary.trim()
      ? body.summary.trim().slice(0, 2000)
      : (insight.content as string).slice(0, 500);
    const tags = Array.isArray(body.tags)
      ? body.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.replace(/[%,()]/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 10)
      : [];

    let purposeId: string | null = null;
    if (targetAmount > 0) {
      const { data: purpose, error: purposeError } = await supabase
        .from('fund_purposes')
        .insert({
          owner_id: user.id,
          name: `支援: ${insight.title}`.slice(0, 120),
          description: '共有アイデアの実現に向けた目的資金',
          category,
          target_amount: targetAmount,
          balance: 0,
          status: 'active',
        })
        .select('id')
        .single();

      if (purposeError) throw purposeError;
      purposeId = purpose.id as string;
    }

    const { data: idea, error } = await supabase
      .from('shared_ideas')
      .insert({
        owner_id: user.id,
        insight_id: insightId,
        purpose_id: purposeId,
        title: insight.title,
        summary,
        category,
        tags,
        needed_support: neededSupport,
        target_amount: targetAmount,
        funded_amount: 0,
        supporter_count: 0,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;

    if (tags.length > 0) {
      try {
        const admin = createAdminClient();
        const filters = tags
          .flatMap((tag) => [`title.ilike.%${tag}%`, `content.ilike.%${tag}%`])
          .join(',');
        const { data: matches } = await admin
          .from('auto_insights')
          .select('user_id')
          .neq('user_id', user.id)
          .or(filters)
          .limit(50);

        const notified = new Set<string>();
        for (const match of matches || []) {
          if (!match.user_id || notified.has(match.user_id)) continue;
          notified.add(match.user_id);
          await notifyUser(admin, {
            userId: match.user_id,
            title: 'あなたの課題に関連するアイデアが共有されました',
            body: String(insight.title ?? ''),
            detail: `関連タグ: ${tags.join(', ')}`,
            kind: 'info',
          });
        }
      } catch (matchError) {
        console.error('Community idea matching error:', matchError);
      }
    }

    return NextResponse.json(idea, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Community idea create error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
