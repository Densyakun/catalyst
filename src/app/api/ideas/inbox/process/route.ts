import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { processIdeaInbox } from '@/lib/ideas/process';

/**
 * POST /api/ideas/inbox/process
 * 処理待ちのアイデアをLLMで構造化し、インサイトとして保存する。
 * LLMが使えない場合は次回再試行できるようpendingのまま残す。
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await processIdeaInbox(supabase, user.id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Idea inbox process error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
