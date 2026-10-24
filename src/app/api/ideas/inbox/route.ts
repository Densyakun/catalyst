import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const MAX_CONTENT_LENGTH = 5000;
const MAX_TITLE_LENGTH = 200;

/**
 * GET  /api/ideas/inbox  保存済みアイデアの一覧
 * POST /api/ideas/inbox  アイデアをLLMを通さず保存（後でAI処理）
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('idea_inbox')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Idea inbox fetch error:', error);
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
      title?: unknown;
      content?: unknown;
      scheduled_at?: unknown;
    };
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';

    if (!content) {
      return NextResponse.json({ error: 'アイデアの内容を入力してください' }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `アイデアは${MAX_CONTENT_LENGTH}文字以内で入力してください` },
        { status: 400 },
      );
    }

    const now = new Date();
    let scheduledAt = now;
    if (typeof body.scheduled_at === 'string' && body.scheduled_at) {
      const parsed = new Date(body.scheduled_at);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '処理日時が不正です' }, { status: 400 });
      }
      scheduledAt = parsed > now ? parsed : now;
    }

    const { data, error } = await supabase
      .from('idea_inbox')
      .insert({
        user_id: user.id,
        title: title ? title.slice(0, MAX_TITLE_LENGTH) : null,
        content,
        source: 'manual',
        status: 'pending',
        next_retry_at: now.toISOString(),
        scheduled_at: scheduledAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Idea inbox save error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
