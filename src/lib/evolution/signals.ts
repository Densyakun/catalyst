import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivitySignal,
  EvolutionSignals,
  FeedbackCategory,
  FeedbackSignal,
} from '@/lib/types/evolution';

/**
 * 自己進化エンジンの入力シグナルを収集する。
 * ユーザーの不満・欲求・興味、操作ログ、未完了の課題・インサイトを集約する。
 */
export async function collectEvolutionSignals(
  supabase: SupabaseClient,
  userId: string,
): Promise<EvolutionSignals> {
  const now = Date.now();
  const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [feedbackRes, activityRes, problemsRes, insightsRes, outcomesRes, conversationsRes] =
    await Promise.all([
      supabase
        .from('user_feedback')
        .select('category, message, sentiment, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('user_activity')
        .select('activity_type, metadata')
        .eq('user_id', userId)
        .gte('created_at', since)
        .limit(2000),
      supabase
        .from('problems')
        .select('context, goal')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('auto_insights')
        .select('title, status')
        .eq('user_id', userId)
        .in('status', ['pending', 'on_hold'])
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('outcomes')
        .select('satisfaction, complaint')
        .lt('satisfaction', 3)
        .order('feedback_date', { ascending: false })
        .limit(20),
      supabase
        .from('conversations')
        .select('messages')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(5),
    ]);

  const feedbackRows = (feedbackRes.data || []) as Array<{
    category: FeedbackCategory;
    message: string | null;
    sentiment: string | null;
    created_at: string;
  }>;

  const feedback: FeedbackSignal[] = feedbackRows.map((f) => ({
    category: f.category,
    message: f.message || '',
    created_at: f.created_at,
  }));

  const complaints = feedbackRows
    .filter((f) => f.category === 'dissatisfaction' || f.category === 'bug' || f.sentiment === 'negative')
    .map((f) => f.message || '')
    .filter(Boolean);

  const desires = feedbackRows
    .filter((f) => f.category === 'desire')
    .map((f) => f.message || '')
    .filter(Boolean);

  const interests = feedbackRows
    .filter((f) => f.category === 'interest')
    .map((f) => f.message || '')
    .filter(Boolean);

  const activityRows = (activityRes.data || []) as Array<{ activity_type: string; metadata: Record<string, unknown> | null }>;
  const activityMap = new Map<string, number>();
  let errorCount = 0;
  let visitCount = 0;
  const errorMessages: string[] = [];

  for (const row of activityRows) {
    activityMap.set(row.activity_type, (activityMap.get(row.activity_type) || 0) + 1);
    if (row.activity_type === 'error') {
      errorCount++;
      const message = row.metadata?.message;
      if (typeof message === 'string' && errorMessages.length < 15) errorMessages.push(message);
    }
    if (row.activity_type === 'visit') visitCount++;
  }

  const activity: ActivitySignal[] = [...activityMap.entries()]
    .map(([activity_type, count]) => ({ activity_type, count }))
    .sort((a, b) => b.count - a.count);

  const problems = (problemsRes.data || [])
    .map((p: { context: string | null }) => p.context || '')
    .filter(Boolean);

  const stuckInsights = (insightsRes.data || [])
    .map((i: { title: string | null }) => i.title || '')
    .filter(Boolean);

  const lowSatisfaction = [
    ...(outcomesRes.data || [])
      .map((o: { complaint: string | null }) => o.complaint || '')
      .filter(Boolean),
    ...errorMessages,
  ];

  const messages: string[] = [];
  for (const conv of conversationsRes.data || []) {
    const msgs = (conv as { messages?: Array<{ role: string; content: string }> }).messages || [];
    for (const m of msgs.slice(-10)) {
      if (m.role === 'user' && m.content) messages.push(m.content.slice(0, 300));
    }
  }

  return {
    feedback,
    complaints,
    desires,
    interests,
    lowSatisfaction,
    problems,
    stuckInsights,
    messages: messages.slice(-30),
    activity,
    stats: {
      feedbackCount: feedback.length,
      negativeCount: complaints.length,
      visitCount,
      errorCount,
      totalEvents: activityRows.length,
    },
  };
}
