import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { collectLlmHealth } from '@/lib/evolution/llm-health';

/**
 * 直近7日間の LLM ヘルスレポートを返す。
 * 認証済みユーザーのみ。集計値のみで、プロンプト本文は含めない。
 *
 * GET /api/evolution/llm-health
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = await collectLlmHealth(supabase);
    return NextResponse.json(report);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('LLM health error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
