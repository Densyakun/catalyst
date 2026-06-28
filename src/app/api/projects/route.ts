import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { decomposeIntoTasks } from '@/lib/ai/agents/decomposer';
import { logCost, estimateOperationCost, calculateCostEstimate } from '@/lib/cost/model';

/**
 * GET: プロジェクト一覧（タスク含む）
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 各プロジェクトのタスクを取得
    const projectsWithTasks = await Promise.all(
      (projects || []).map(async (project) => {
        const { data: tasks } = await supabase
          .from('project_tasks')
          .select('*')
          .eq('project_id', project.id)
          .order('sort_order', { ascending: true });

        return { ...project, tasks: tasks || [] };
      }),
    );

    return NextResponse.json(projectsWithTasks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: インサイトからプロジェクト化（タスク自動分割）
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { insight_id, title, description, is_social } = await req.json();

    if (!title || !description) {
      return NextResponse.json({ error: 'title and description are required' }, { status: 400 });
    }

    // ユーザーのリソースを取得
    const { data: resources } = await supabase
      .from('user_resources')
      .select('name, resource_type, description')
      .eq('user_id', user.id);

    const availableResources = (resources || []).map((r) => ({
      name: r.name,
      type: r.resource_type,
      description: r.description || '',
    }));

    // タスク分割
    const decomposition = await decomposeIntoTasks(
      title,
      description,
      is_social ?? false,
      availableResources,
    );

    // コスト推定
    const costEstimate = await calculateCostEstimate(
      decomposition.total_estimated_cost,
      decomposition.is_social,
    );

    // プロジェクト作成
    const { data: project, error: projError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        insight_id: insight_id || null,
        title,
        description,
        total_estimated_cost: decomposition.total_estimated_cost,
        is_social: decomposition.is_social,
        estimated_beneficiaries: decomposition.estimated_beneficiaries,
        status: 'planning',
      })
      .select()
      .single();

    if (projError) throw projError;

    // タスク作成
    const taskRecords = decomposition.tasks.map((task) => ({
      project_id: project.id,
      title: task.title,
      description: task.description,
      estimated_cost: task.estimated_cost,
      execution_type: task.execution_type,
      depends_on: task.depends_on_indices.map((depIdx) =>
        // 依存先のインデックスを後でIDに置換するため、一旦仮値
        `__dep_${depIdx}`,
      ),
      sort_order: task.sort_order,
      status: task.depends_on_indices.length === 0 ? 'ready' : 'pending',
    }));

    const { data: tasks, error: taskError } = await supabase
      .from('project_tasks')
      .insert(taskRecords)
      .select();

    if (taskError) throw taskError;

    // 依存関係のIDを実際のタスクIDに置換
    if (tasks) {
      for (const task of tasks) {
        const deps = (task.depends_on as string[]).map((dep: string) => {
          const match = dep.match(/^__dep_(\d+)$/);
          if (match) {
            const depIndex = parseInt(match[1], 10);
            return tasks[depIndex]?.id ?? dep;
          }
          return dep;
        });

        if (deps.some((d: string) => !d.startsWith('__dep_'))) {
          await supabase
            .from('project_tasks')
            .update({ depends_on: deps })
            .eq('id', task.id);
        }
      }
    }

    // コストログ
    await logCost({
      userId: user.id,
      operationType: 'decomposition',
      actualCost: estimateOperationCost('decomposition', 1),
      relatedProjectId: project.id,
      isSocial: decomposition.is_social,
      estimatedBeneficiaries: decomposition.estimated_beneficiaries ?? undefined,
      estimatedUserShare: costEstimate.user_share,
    });

    // インサイトのステータスを更新
    if (insight_id) {
      await supabase
        .from('auto_insights')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', insight_id);
    }

    return NextResponse.json({
      project: { ...project, tasks: tasks || [] },
      cost_estimate: costEstimate,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Project creation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
