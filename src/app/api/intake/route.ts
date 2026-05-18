import { NextResponse } from 'next/server';
import { getNextIntakeStep, structureProblem, UserContext } from '@/lib/ai/agents/intake';
import { prioritizeProblem } from '@/lib/ai/agents/prioritizer';
import { proposeActions } from '@/lib/ai/agents/solver';
import { updateClusters } from '@/lib/ai/agents/clusterer';
import { createClient } from '@/lib/supabase-server';

async function fetchUserContext(userId: string): Promise<UserContext> {
  const supabase = await createClient();
  const context: UserContext = {};

  const { data: pastSessions } = await supabase
    .from('diagnostic_sessions')
    .select('answers, updated_at')
    .eq('user_id', userId)
    .eq('is_completed', true)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (pastSessions?.length) {
    context.pastSessions = pastSessions.map(s => ({
      answers: s.answers,
      completedAt: s.updated_at,
    }));
  }

  const { data: pastProblems } = await supabase
    .from('problems')
    .select('context, symptoms, goal, tags, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (pastProblems?.length) {
    context.pastProblems = pastProblems;
  }

  const { count: visitCount } = await supabase
    .from('user_activity')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('activity_type', 'visit');

  const { count: clickCount } = await supabase
    .from('user_activity')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('activity_type', 'click_action');

  context.activitySummary = {
    visitCount: visitCount || 0,
    previousClicks: clickCount || 0,
  };

  return context;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { answers, sessionId } = await req.json();

    const { data: { user } } = await supabase.auth.getUser();

    let userContext: UserContext | undefined;
    if (user) {
      userContext = await fetchUserContext(user.id);
    }

    const step = await getNextIntakeStep(answers, userContext);

    if (step.type === 'question') {
      if (user) {
        await supabase.from('diagnostic_sessions').upsert({
          id: sessionId || undefined,
          user_id: user.id,
          answers,
          current_question: step,
          is_completed: false,
          updated_at: new Date().toISOString()
        });
      }
      return NextResponse.json(step);
    }

    const rawProblems = await structureProblem(answers, userContext);
    const problemsData = [];
    
    for (const p of rawProblems) {
      const prioritized = await prioritizeProblem(p);
      problemsData.push(prioritized);
    }

    const results = [];

    for (const pData of problemsData) {
      const { data: problem, error: pError } = await supabase
        .from('problems')
        .insert({
          user_id: user?.id,
          context: pData.context,
          symptoms: pData.symptoms,
          constraints: pData.constraints,
          goal: pData.goal,
          severity: pData.severity,
          frequency: pData.frequency,
          tags: pData.tags,
          personal_priority: pData.personal_priority,
          social_impact: pData.social_impact,
          priority_score: pData.priority_score,
          cluster_id: pData.cluster_id,
          status: 'unsolved'
        })
        .select()
        .single();

      if (pError) throw pError;

      const actions = await proposeActions(problem, userContext?.activitySummary || { visitCount: 0, previousClicks: 0 });

      const actionsWithId = actions.map(a => ({
        description: a.description,
        reason: a.reason,
        type: a.type,
        time_cost: a.cost.time,
        money_cost: a.cost.money,
        expected_gain: a.expectedGain,
        risk: a.risk,
        link: a.link,
        is_recommended: a.isRecommended,
        problem_id: problem.id,
        user_id: user?.id
      }));

      const { data: savedActions, error: aError } = await supabase
        .from('actions')
        .insert(actionsWithId)
        .select();

      if (aError) throw aError;

      results.push({
        problem,
        actions: savedActions
      });
    }

    if (user && sessionId) {
      await supabase.from('diagnostic_sessions').update({ is_completed: true }).eq('id', sessionId);
    }

    updateClusters().catch(err => console.error('Auto-clustering error:', err));

    return NextResponse.json({
      type: 'result',
      results
    });

  } catch (error: any) {
    console.error('Intake API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
