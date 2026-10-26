import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type {
  TodayAction,
  TodayData,
  TodayFocus,
  TodayInsight,
  TodayProblem,
  TodayUrgency,
} from '@/lib/types/today';

function firstLine(text: string, max = 64): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function parseInsightUrgency(insight: TodayInsight): TodayUrgency {
  const match = insight.content.match(/緊急度[:：]\s*(high|medium|low)/);
  return (match?.[1] as TodayUrgency) || 'low';
}

function problemUrgency(problem: TodayProblem): TodayUrgency {
  const severity = problem.severity ?? 0;
  if (severity >= 8) return 'high';
  if (severity >= 5) return 'medium';
  return 'low';
}

function insightNextStep(insight: TodayInsight): string | null {
  const match = insight.content.match(/(?:最初の一歩|アプローチ|次の一歩)[:：]\s*(.+)/);
  return match?.[1]?.trim() ?? null;
}

function sortActions(actions: TodayAction[] | undefined): TodayAction[] {
  return [...(actions || [])].sort(
    (a, b) => Number(Boolean(b.is_recommended)) - Number(Boolean(a.is_recommended)),
  );
}

function toProblemFocus(problem: TodayProblem): TodayFocus {
  const actions = sortActions(problem.actions);
  const action = actions.find((a) => a.is_recommended) ?? actions[0] ?? null;
  const urgency = problemUrgency(problem);

  return {
    kind: 'problem',
    id: problem.id,
    title: firstLine(problem.context),
    description: problem.context,
    goal: problem.goal,
    urgency,
    reason:
      urgency === 'high'
        ? '深刻度が高く、放置すると損が大きい課題です'
        : urgency === 'medium'
          ? 'いま取り組む価値が高い課題です'
          : '優先度スコアが最も高い課題です',
    nextStep: action?.description ?? null,
    cost: action?.cost ?? null,
    action,
    problem,
    insight: null,
  };
}

function toInsightFocus(insight: TodayInsight): TodayFocus {
  const urgency = parseInsightUrgency(insight);
  const nextStep = insightNextStep(insight);

  return {
    kind: 'insight',
    id: insight.id,
    title: insight.title,
    description: insight.content,
    goal: null,
    urgency,
    reason:
      urgency === 'high'
        ? 'AIが緊急度の高い気づきとして検出しました'
        : 'AIがあなたの入力を整理して見つけた候補です',
    nextStep,
    cost: insight.estimated_cost,
    action: null,
    problem: null,
    insight,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [
      problemsRes,
      insightsRes,
      unsolvedCountRes,
      solvedCountRes,
      pendingInsightCountRes,
      pendingIdeaCountRes,
      activeProjectCountRes,
      totalProblemCountRes,
      conversationCountRes,
    ] = await Promise.all([
      supabase
        .from('problems')
        .select('id, context, symptoms, constraints, goal, severity, priority, priority_score, status, created_at, actions(*)')
        .eq('user_id', user.id)
        .neq('status', 'solved')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('auto_insights')
        .select('id, insight_type, title, content, status, estimated_cost, created_at')
        .eq('user_id', user.id)
        .in('status', ['pending', 'on_hold'])
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('problems')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .neq('status', 'solved'),
      supabase
        .from('problems')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'solved'),
      supabase
        .from('auto_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pending', 'on_hold']),
      supabase
        .from('idea_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['planning', 'in_progress']),
      supabase
        .from('problems')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_archived', false),
    ]);

    const problems = (problemsRes.data || []) as unknown as TodayProblem[];
    const insights = (insightsRes.data || []) as unknown as TodayInsight[];

    const candidates: Array<{ focus: TodayFocus; score: number }> = [
      ...problems.map((problem) => ({
        focus: toProblemFocus(problem),
        score:
          (problem.priority_score ?? 0) * 100 +
          (problem.severity ?? 0) +
          (problem.priority ?? 0),
      })),
      ...insights.map((insight) => {
        const focus = toInsightFocus(insight);
        const urgencyScore = focus.urgency === 'high' ? 90 : focus.urgency === 'medium' ? 55 : 20;
        return {
          focus,
          score: urgencyScore + (insight.insight_type === 'suggestion' ? 5 : 0),
        };
      }),
    ].sort((a, b) => b.score - a.score);

    const data: TodayData = {
      focus: candidates[0]?.focus ?? null,
      upNext: candidates.slice(1, 4).map((candidate) => candidate.focus),
      stats: {
        unsolvedProblems: unsolvedCountRes.count ?? 0,
        solvedProblems: solvedCountRes.count ?? 0,
        pendingInsights: pendingInsightCountRes.count ?? 0,
        pendingIdeas: pendingIdeaCountRes.count ?? 0,
        activeProjects: activeProjectCountRes.count ?? 0,
      },
      isNewUser:
        (totalProblemCountRes.count ?? 0) === 0 &&
        (pendingInsightCountRes.count ?? 0) === 0 &&
        (conversationCountRes.count ?? 0) === 0 &&
        (pendingIdeaCountRes.count ?? 0) === 0,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Today fetch error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
