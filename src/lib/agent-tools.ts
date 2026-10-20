import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentContextProposal,
  AgentContextResponse,
  AgentReportRequest,
  ProposalStatus,
} from '@/lib/types/evolution';

/**
 * エージェント/MCP向けのツール実装（REST route と MCP で共有）。
 * すべて認証済みの userId にスコープされる。
 */

export async function listProposals(
  supabase: SupabaseClient,
  userId: string,
  status: ProposalStatus = 'approved',
): Promise<AgentContextProposal[]> {
  const { data, error } = await supabase
    .from('evolution_proposals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', status)
    .order('priority', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(toContextProposal);
}

export async function getProposalContext(
  supabase: SupabaseClient,
  userId: string,
  proposalId: string,
): Promise<AgentContextResponse | null> {
  const { data: proposal, error } = await supabase
    .from('evolution_proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!proposal) return null;

  return {
    proposals: [toContextProposal(proposal)],
    related: await loadRelated(supabase, userId),
  };
}

export async function reportResult(
  supabase: SupabaseClient,
  userId: string,
  body: AgentReportRequest,
): Promise<Record<string, unknown>> {
  if (!body?.proposal_id) {
    throw new Error('proposal_id is required');
  }

  const { data: proposal, error: fetchError } = await supabase
    .from('evolution_proposals')
    .select('id, user_id, title')
    .eq('id', body.proposal_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!proposal) throw new Error('proposal not found');

  const update: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (body.repo !== undefined) update.github_repo = body.repo;
  if (body.issue_number !== undefined) update.github_issue_number = body.issue_number;
  if (body.issue_url !== undefined) update.github_issue_url = body.issue_url;
  if (body.pr_url !== undefined) update.github_pr_url = body.pr_url;
  if (body.state !== undefined) update.external_state = body.state;

  const mappedStatus = mapStatus(body.state);
  if (mappedStatus) update.status = mappedStatus;

  const { data: updated, error: updateError } = await supabase
    .from('evolution_proposals')
    .update(update)
    .eq('id', body.proposal_id)
    .eq('user_id', userId)
    .select()
    .single();
  if (updateError) throw updateError;

  if (body.notify !== false && body.summary && proposal.user_id) {
    await insertNotificationOnce(supabase, {
      userId: proposal.user_id,
      proposalId: proposal.id,
      title: proposal.title,
      body: body.summary,
    });
  }

  return updated as Record<string, unknown>;
}

// ------------------------------------------------------------

const PROPOSAL_STATUSES: ProposalStatus[] = ['proposed', 'approved', 'in_progress', 'implemented', 'rejected'];

function mapStatus(state?: string): ProposalStatus | null {
  if (!state) return null;
  const normalized = state.toLowerCase();
  if (PROPOSAL_STATUSES.includes(normalized as ProposalStatus)) return normalized as ProposalStatus;
  if (['open', 'in_progress', 'in-progress'].includes(normalized)) return 'in_progress';
  if (['merged', 'closed', 'done', 'completed', 'implemented'].includes(normalized)) return 'implemented';
  if (['rejected', 'wontfix', 'invalid'].includes(normalized)) return 'rejected';
  return null;
}

async function loadRelated(supabase: SupabaseClient, userId: string) {
  const [feedbackRes, problemsRes] = await Promise.all([
    supabase
      .from('user_feedback')
      .select('category, message')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('problems')
      .select('context')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const feedback = (feedbackRes.data || [])
    .map((f: { category: string; message: string | null }) => `[${f.category}] ${f.message || ''}`.trim())
    .filter(Boolean);
  const problems = (problemsRes.data || [])
    .map((p: { context: string | null }) => p.context || '')
    .filter(Boolean);

  return { feedback, problems, stats: { feedbackCount: feedback.length } };
}

function toContextProposal(row: Record<string, unknown>): AgentContextProposal {
  return {
    id: String(row.id),
    user_id: (row.user_id as string | null) ?? null,
    title: String(row.title ?? ''),
    category: row.category as AgentContextProposal['category'],
    rationale: String(row.rationale ?? ''),
    target_area: (row.target_area as string | null) ?? null,
    proposed_change: (row.proposed_change as string | null) ?? null,
    priority: Number(row.priority ?? 0),
    evidence: (row.evidence as string[]) ?? [],
    signals: (row.signals as AgentContextProposal['signals']) ?? {},
    status: row.status as ProposalStatus,
    github_repo: (row.github_repo as string | null) ?? null,
    github_issue_number: (row.github_issue_number as number | null) ?? null,
    github_issue_url: (row.github_issue_url as string | null) ?? null,
  };
}

async function insertNotificationOnce(
  supabase: SupabaseClient,
  params: { userId: string; proposalId: string; title: string; body: string },
) {
  const { data: existing } = await supabase
    .from('user_notifications')
    .select('id')
    .eq('proposal_id', params.proposalId)
    .eq('body', params.body)
    .limit(1);
  if (existing && existing.length > 0) return;

  await supabase.from('user_notifications').insert({
    user_id: params.userId,
    proposal_id: params.proposalId,
    title: `改善を反映しました: ${params.title}`,
    body: params.body,
    kind: 'improvement',
  });
}

// ------------------------------------------------------------
// 構想の移行（課題・プロジェクト・リソース・提案の作成）
// ------------------------------------------------------------

export interface CreateProblemInput {
  context: string;
  symptoms?: string;
  constraints?: string;
  goal?: string;
  severity?: number;
  frequency?: string;
  priority?: number;
  tags?: string[];
  status?: string;
}

export interface CreateProjectTaskInput {
  title: string;
  description?: string;
  estimated_cost?: number;
  execution_type?: 'auto' | 'user' | 'hybrid';
  depends_on_indices?: number[];
  sort_order?: number;
  status?: 'pending' | 'ready' | 'in_progress' | 'completed' | 'blocked';
}

export interface CreateProjectInput {
  title: string;
  description?: string;
  is_social?: boolean;
  estimated_beneficiaries?: number;
  status?: 'planning' | 'in_progress' | 'completed' | 'on_hold';
  tasks?: CreateProjectTaskInput[];
}

export interface CreateResourceInput {
  resource_type: 'time' | 'money' | 'skill' | 'tool' | 'connection';
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateProposalInput {
  title: string;
  category?: 'feature' | 'ux' | 'bug' | 'performance' | 'content';
  rationale: string;
  target_area?: string;
  proposed_change?: string;
  priority?: number;
  evidence?: string[];
  status?: ProposalStatus;
}

export async function listProblems(
  supabase: SupabaseClient,
  userId: string,
  opts: { status?: string; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  let query = supabase
    .from('problems')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 200));
  if (opts.status) query = query.eq('status', opts.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Record<string, unknown>[];
}

export async function createProblem(
  supabase: SupabaseClient,
  userId: string,
  input: CreateProblemInput,
): Promise<Record<string, unknown>> {
  if (!input?.context || !input.context.trim()) {
    throw new Error('context is required');
  }
  const { data, error } = await supabase
    .from('problems')
    .insert({
      user_id: userId,
      context: input.context,
      symptoms: input.symptoms ?? null,
      constraints: input.constraints ?? null,
      goal: input.goal ?? null,
      severity: input.severity ?? null,
      frequency: input.frequency ?? null,
      priority: input.priority ?? null,
      status: input.status ?? 'unsolved',
      tags: input.tags ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function listProjects(
  supabase: SupabaseClient,
  userId: string,
  opts: { limit?: number; withTasks?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 200));
  if (error) throw error;
  const projects = (data || []) as Record<string, unknown>[];
  if (!opts.withTasks) return projects;

  return Promise.all(
    projects.map(async (project) => {
      const { data: tasks } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('project_id', String(project.id))
        .order('sort_order', { ascending: true });
      return { ...project, tasks: tasks || [] };
    }),
  );
}

export async function createProject(
  supabase: SupabaseClient,
  userId: string,
  input: CreateProjectInput,
): Promise<Record<string, unknown>> {
  if (!input?.title || !input.title.trim()) {
    throw new Error('title is required');
  }
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  for (const [i, task] of tasks.entries()) {
    if (!task?.title || !task.title.trim()) {
      throw new Error(`tasks[${i}].title is required`);
    }
  }

  const totalEstimated = tasks.reduce((sum, t) => sum + Number(t.estimated_cost ?? 0), 0);
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      is_social: input.is_social ?? false,
      estimated_beneficiaries: input.estimated_beneficiaries ?? null,
      status: input.status ?? 'planning',
      total_estimated_cost: totalEstimated,
    })
    .select()
    .single();
  if (error) throw error;

  let insertedTasks: Record<string, unknown>[] = [];
  if (tasks.length > 0) {
    const records = tasks.map((task, i) => ({
      project_id: project.id,
      title: task.title,
      description: task.description ?? null,
      estimated_cost: task.estimated_cost ?? 0,
      execution_type: task.execution_type ?? 'user',
      depends_on: (task.depends_on_indices ?? []).map((idx) => `__dep_${idx}`),
      sort_order: task.sort_order ?? i,
      status: task.status ?? ((task.depends_on_indices ?? []).length === 0 ? 'ready' : 'pending'),
    }));
    const { data: created, error: taskError } = await supabase
      .from('project_tasks')
      .insert(records)
      .select();
    if (taskError) throw taskError;
    insertedTasks = (created || []) as Record<string, unknown>[];

    for (const task of insertedTasks) {
      const deps = (task.depends_on as string[] | null) ?? [];
      const resolved = deps.map((dep) => {
        const match = dep.match(/^__dep_(\d+)$/);
        if (!match) return dep;
        const idx = parseInt(match[1], 10);
        return (insertedTasks[idx]?.id as string | undefined) ?? dep;
      });
      if (resolved.some((dep) => !dep.startsWith('__dep_'))) {
        await supabase.from('project_tasks').update({ depends_on: resolved }).eq('id', String(task.id));
      }
    }
  }

  return { ...project, tasks: insertedTasks };
}

export async function listResources(
  supabase: SupabaseClient,
  userId: string,
  opts: { limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('user_resources')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 200));
  if (error) throw error;
  return (data || []) as Record<string, unknown>[];
}

export async function createResource(
  supabase: SupabaseClient,
  userId: string,
  input: CreateResourceInput,
): Promise<Record<string, unknown>> {
  const validTypes = ['time', 'money', 'skill', 'tool', 'connection'];
  if (!input?.name || !input.name.trim()) throw new Error('name is required');
  if (!validTypes.includes(input.resource_type)) {
    throw new Error(`Invalid resource_type. Must be one of: ${validTypes.join(', ')}`);
  }
  const { data, error } = await supabase
    .from('user_resources')
    .insert({
      user_id: userId,
      resource_type: input.resource_type,
      name: input.name,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function createProposal(
  supabase: SupabaseClient,
  userId: string,
  input: CreateProposalInput,
): Promise<Record<string, unknown>> {
  if (!input?.title || !input.title.trim()) throw new Error('title is required');
  if (!input.rationale || !input.rationale.trim()) throw new Error('rationale is required');
  const categories = ['feature', 'ux', 'bug', 'performance', 'content'];
  const category = input.category ?? 'feature';
  if (!categories.includes(category)) {
    throw new Error(`Invalid category. Must be one of: ${categories.join(', ')}`);
  }
  const { data, error } = await supabase
    .from('evolution_proposals')
    .insert({
      user_id: userId,
      title: input.title,
      category,
      rationale: input.rationale,
      target_area: input.target_area ?? null,
      proposed_change: input.proposed_change ?? null,
      priority: input.priority ?? 0.5,
      evidence: input.evidence ?? [],
      signals: {},
      status: input.status ?? 'proposed',
    })
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}
