import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { CreateFeedbackRequest, FeedbackSentiment } from '@/lib/types/evolution';

/**
 * 明示的フィードバック（不満・欲求・興味・バグ・称賛）を収集する。
 *
 * POST /api/feedback
 * body: { category, message?, rating?, context_path?, context_feature? }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as CreateFeedbackRequest;
    if (!body?.category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }

    const message = (body.message || '').slice(0, 2000);

    const { data, error } = await supabase
      .from('user_feedback')
      .insert({
        user_id: user.id,
        category: body.category,
        rating: body.rating ?? null,
        message,
        context_path: body.context_path ?? null,
        context_feature: body.context_feature ?? null,
        sentiment: inferSentiment(body.category, message, body.rating),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Feedback error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_feedback')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Feedback fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const NEGATIVE_HINTS = ['使えない', 'わからない', '分からない', '難しい', '不便', '遅い', 'うまく', '失敗', 'バグ', 'エラー', '嫌', 'だめ', 'ダメ', '不満', '消えた', 'できない'];

function inferSentiment(
  category: string,
  message: string,
  rating?: number,
): FeedbackSentiment {
  if (typeof rating === 'number') {
    if (rating <= 2) return 'negative';
    if (rating >= 4) return 'positive';
  }
  if (category === 'praise') return 'positive';
  if (category === 'dissatisfaction' || category === 'bug') return 'negative';
  if (NEGATIVE_HINTS.some((hint) => message.includes(hint))) return 'negative';
  return 'neutral';
}
