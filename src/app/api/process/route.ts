import { NextRequest, NextResponse } from 'next/server';
import { structureProblem } from '@/lib/ai/agents/intake';
import { proposeActions } from '@/lib/ai/agents/solver';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { input } = await req.json();

    if (!input) {
      return NextResponse.json({ error: 'Input is required' }, { status: 400 });
    }

    // 1. Intake & Structuring
    const structuredProblems = await structureProblem([
      { question: '課題', answer: String(input) },
    ]);
    const structuredProblem = structuredProblems[0];

    if (!structuredProblem) {
      return NextResponse.json(
        { error: '課題を構造化できませんでした' },
        { status: 422 },
      );
    }

    // 2. Solving
    const actions = await proposeActions(structuredProblem);

    // 3. Persist to Supabase
    const { data: problemData, error: problemError } = await supabase
      .from('problems')
      .insert([{
        user_id: user?.id,
        context: structuredProblem.context,
        symptoms: structuredProblem.symptoms,
        constraints: structuredProblem.constraints,
        goal: structuredProblem.goal,
        severity: structuredProblem.severity,
        frequency: structuredProblem.frequency,
        priority: structuredProblem.priority_score,
        status: structuredProblem.status ?? 'unsolved',
        tags: structuredProblem.tags,
      }])
      .select()
      .single();

    if (problemError) throw problemError;

    const dbActions = actions.map(action => ({
      problem_id: problemData.id,
      user_id: user?.id,
      type: action.type,
      description: action.description,
      cost: action.cost,
      expected_gain: action.expectedGain,
      risk: action.risk,
      link: action.link,
      is_recommended: action.isRecommended
    }));

    const { error: actionsError } = await supabase
      .from('actions')
      .insert(dbActions);

    if (actionsError) throw actionsError;

    return NextResponse.json({
      problem: problemData,
      actions: actions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Processing error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
