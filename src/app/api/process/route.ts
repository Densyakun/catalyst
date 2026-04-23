import { NextRequest, NextResponse } from 'next/server';
import { structureProblem } from '@/lib/ai/agents/intake';
import { proposeActions } from '@/lib/ai/agents/solver';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json();

    if (!input) {
      return NextResponse.json({ error: 'Input is required' }, { status: 400 });
    }

    // 1. Intake & Structuring
    const structuredProblem = await structureProblem(input);

    // 2. Solving
    const actions = await proposeActions(structuredProblem);

    // 3. Persist to Supabase
    const { data: problemData, error: problemError } = await supabase
      .from('problems')
      .insert([{
        context: structuredProblem.context,
        symptoms: structuredProblem.symptoms,
        constraints: structuredProblem.constraints,
        goal: structuredProblem.goal,
        severity: structuredProblem.severity,
        frequency: structuredProblem.frequency,
        priority: structuredProblem.priority,
        status: structuredProblem.status,
        tags: structuredProblem.tags
      }])
      .select()
      .single();

    if (problemError) throw problemError;

    const dbActions = actions.map(action => ({
      problem_id: problemData.id,
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
  } catch (error: any) {
    console.error('Processing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
