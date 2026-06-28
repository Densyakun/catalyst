import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateTextForRole } from '@/lib/ai/call';
import { logCost, estimateOperationCost } from '@/lib/cost/model';

/**
 * POST: タスクを実行
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { id: projectId, taskId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // プロジェクト所有権確認
    const { data: project } = await supabase
      .from('projects')
      .select('id, title, is_social, estimated_beneficiaries')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // タスク取得
    const { data: task, error: taskError } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('id', taskId)
      .eq('project_id', projectId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (task.status === 'completed') {
      return NextResponse.json({ error: 'Task already completed' }, { status: 400 });
    }

    if (task.execution_type === 'user') {
      return NextResponse.json({
        error: 'This task requires user action and cannot be auto-executed',
      }, { status: 400 });
    }

    // 依存タスクの完了確認
    const deps = (task.depends_on as string[]) || [];
    if (deps.length > 0) {
      const { data: depTasks } = await supabase
        .from('project_tasks')
        .select('id, status')
        .in('id', deps);

      const incompleteDepExists = (depTasks || []).some((d) => d.status !== 'completed');
      if (incompleteDepExists) {
        return NextResponse.json({
          error: 'Dependent tasks not yet completed',
        }, { status: 400 });
      }
    }

    // タスクをin_progressに更新
    await supabase
      .from('project_tasks')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', taskId);

    // 依存タスクの出力を入力として取得
    let inputContext = '';
    if (deps.length > 0) {
      const { data: depOutputs } = await supabase
        .from('project_tasks')
        .select('title, output_data')
        .in('id', deps);

      inputContext = (depOutputs || [])
        .filter((d) => d.output_data)
        .map((d) => `【${d.title}の結果】\n${JSON.stringify(d.output_data)}`)
        .join('\n\n');
    }

    // AI実行
    const { text: result } = await generateTextForRole('solving', {
      prompt: `以下のタスクを実行し、成果物を出力せよ。

【プロジェクト】${project.title}
【タスク】${task.title}
【説明】${task.description || ''}

${inputContext ? `【前タスクの結果】\n${inputContext}` : ''}

成果物を具体的に出力すること。`,
    });

    // タスク完了
    const actualCost = estimateOperationCost('task_execution', 1);

    await supabase
      .from('project_tasks')
      .update({
        status: 'completed',
        output_data: { result },
        actual_cost: actualCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    // コストログ
    await logCost({
      userId: user.id,
      operationType: 'task_execution',
      actualCost,
      relatedProjectId: projectId,
      relatedTaskId: taskId,
      isSocial: project.is_social,
      estimatedBeneficiaries: project.estimated_beneficiaries ?? undefined,
    });

    // プロジェクトの実コストを更新
    const { data: allTasks } = await supabase
      .from('project_tasks')
      .select('actual_cost, status')
      .eq('project_id', projectId);

    const totalActualCost = (allTasks || []).reduce(
      (sum, t) => sum + Number(t.actual_cost || 0), 0,
    );
    const allCompleted = (allTasks || []).every((t) => t.status === 'completed' || t.execution_type === 'user');

    await supabase
      .from('projects')
      .update({
        total_actual_cost: totalActualCost,
        status: allCompleted ? 'completed' : 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    // 依存解決: このタスクに依存していたタスクをreadyに
    const { data: dependentTasks } = await supabase
      .from('project_tasks')
      .select('id, depends_on, status')
      .eq('project_id', projectId)
      .eq('status', 'pending');

    for (const depTask of dependentTasks || []) {
      const depIds = (depTask.depends_on as string[]) || [];
      if (depIds.includes(taskId)) {
        // このタスクに依存している → 全依存が完了か確認
        const { data: otherDeps } = await supabase
          .from('project_tasks')
          .select('id, status')
          .in('id', depIds.filter((d) => d !== taskId));

        const allDepsComplete = (otherDeps || []).every((d) => d.status === 'completed');
        if (allDepsComplete) {
          await supabase
            .from('project_tasks')
            .update({ status: 'ready', updated_at: new Date().toISOString() })
            .eq('id', depTask.id);
        }
      }
    }

    return NextResponse.json({
      task_id: taskId,
      status: 'completed',
      output: result,
      actual_cost: actualCost,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Task execution error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT: タスクのステータスを手動更新（user タスク完了時など）
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { id: projectId, taskId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status, output } = await req.json();

    // プロジェクト所有権確認
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (output) {
      updates.output_data = { result: output };
    }

    await supabase
      .from('project_tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('project_id', projectId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
