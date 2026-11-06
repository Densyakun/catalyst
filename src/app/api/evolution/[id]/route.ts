import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { isAdminUser } from '@/lib/admin';
import {
  appendGovernanceDecision,
  assertCoreTransitionAllowed,
  forkCoreGovernance,
  resolveProposalGovernance,
} from '@/lib/evolution/governance';
import type { ProposalCategory, ProposalStatus } from '@/lib/types/evolution';

const ALLOWED: ProposalStatus[] = ['proposed', 'approved', 'in_progress', 'implemented', 'rejected'];

/**
 * PATCH /api/evolution/[id]  提案のステータス更新（承認/却下/完了）またはコアのフォーク
 * DELETE /api/evolution/[id] 提案の削除
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      status?: ProposalStatus;
      action?: 'fork';
      note?: string;
    };

    const { data: proposal, error: fetchError } = await supabase
      .from('evolution_proposals')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!proposal) {
      return NextResponse.json({ error: 'proposal not found' }, { status: 404 });
    }

    const governance = resolveProposalGovernance(proposal.signals, {
      title: String(proposal.title ?? ''),
      category: proposal.category as ProposalCategory,
      rationale: proposal.rationale as string | null,
      target_area: proposal.target_area as string | null,
      proposed_change: proposal.proposed_change as string | null,
    });
    const actorRole = isAdminUser(user) ? 'admin' : 'member';

    if (body.action === 'fork') {
      const forkedGovernance = forkCoreGovernance(governance, {
        sourceId: id,
        actorId: user.id,
        actorRole,
      });
      const { data, error } = await supabase
        .from('evolution_proposals')
        .insert({
          user_id: user.id,
          title: `[fork] ${proposal.title}`,
          category: proposal.category,
          rationale: proposal.rationale,
          target_area: proposal.target_area,
          proposed_change: proposal.proposed_change,
          priority: proposal.priority,
          evidence: proposal.evidence ?? [],
          signals: {
            ...((proposal.signals as Record<string, unknown> | null) ?? {}),
            governance: forkedGovernance,
          },
          status: 'proposed',
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json(data);
    }

    const status = body.status;
    if (!status || !ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    assertCoreTransitionAllowed(governance, status, actorRole);

    const nextGovernance = appendGovernanceDecision(governance, {
      from: proposal.status as ProposalStatus,
      to: status,
      actorId: user.id,
      actorType: 'human',
      actorRole,
      note: body.note ?? null,
    });

    const { data, error } = await supabase
      .from('evolution_proposals')
      .update({
        status,
        updated_at: new Date().toISOString(),
        signals: {
          ...((proposal.signals as Record<string, unknown> | null) ?? {}),
          governance: nextGovernance,
        },
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Evolution update error:', error);
    const status = message.includes('Only core proposals')
      ? 400
      : message.includes('Core changes require')
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('evolution_proposals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Evolution delete error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
