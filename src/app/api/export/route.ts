import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const USER_TABLES = [
  'problems',
  'actions',
  'auto_insights',
  'idea_inbox',
  'conversations',
  'user_resources',
  'marked_items',
  'projects',
  'cost_log',
  'user_feedback',
  'user_notifications',
  'donations',
  'user_balance',
  'fund_transactions',
  'payments',
  'diagnostic_sessions',
  'answers',
  'user_activity',
  'evolution_proposals',
  'shared_idea_supporters',
] as const;

const OWNER_TABLES = ['fund_purposes', 'shared_ideas'] as const;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function fetchRows(
  supabase: SupabaseClient,
  table: string,
  column: 'user_id' | 'owner_id',
  userId: string,
) {
  const { data, error } = await supabase.from(table).select('*').eq(column, userId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

/**
 * GET /api/export
 * ユーザーが自分のデータをJSONとしてダウンロードする。
 * OAuthトークン・APIトークンなど認証情報は含めない。
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [userTables, ownerTables] = await Promise.all([
      Promise.all(
        USER_TABLES.map(async (table) => [table, await fetchRows(supabase, table, 'user_id', user.id)] as const),
      ),
      Promise.all(
        OWNER_TABLES.map(async (table) => [table, await fetchRows(supabase, table, 'owner_id', user.id)] as const),
      ),
    ]);

    const data: Record<string, unknown[]> = Object.fromEntries([...userTables, ...ownerTables]);
    const actions = data.actions as Array<{ id?: string }> | undefined;
    const projects = data.projects as Array<{ id?: string }> | undefined;

    if (actions?.length) {
      const actionIds = actions.map((action) => action.id).filter((id): id is string => Boolean(id));
      if (actionIds.length > 0) {
        const { data: outcomes, error } = await supabase
          .from('outcomes')
          .select('*')
          .in('action_id', actionIds);
        if (error) throw new Error(`outcomes: ${error.message}`);
        data.outcomes = outcomes ?? [];
      }
    }

    if (projects?.length) {
      const projectIds = projects.map((project) => project.id).filter((id): id is string => Boolean(id));
      if (projectIds.length > 0) {
        const { data: tasks, error } = await supabase
          .from('project_tasks')
          .select('*')
          .in('project_id', projectIds);
        if (error) throw new Error(`project_tasks: ${error.message}`);
        data.project_tasks = tasks ?? [];
      }
    }

    const exportedAt = new Date().toISOString();
    const body = JSON.stringify(
      {
        format: 'katalyse-export',
        version: 1,
        exported_at: exportedAt,
        user: { id: user.id, email: user.email ?? null },
        data,
      },
      null,
      2,
    );

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="katalyse-export-${exportedAt.slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Data export error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
