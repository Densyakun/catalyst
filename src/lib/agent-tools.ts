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
