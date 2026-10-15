import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { EvolutionProposal } from '@/lib/types/evolution';

/**
 * 承認済みの自己進化提案を、実装エージェント（opencode等）が読めるMarkdownに出力する。
 *
 * GET  /api/evolution/backlog → Markdownを返す
 * POST /api/evolution/backlog → 同上（クライアント側でダウンロード等に利用）
 */
export async function GET() {
  return buildBacklog();
}

export async function POST() {
  return buildBacklog();
}

async function buildBacklog() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('evolution_proposals')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['approved', 'in_progress'])
      .order('priority', { ascending: false });

    if (error) throw error;

    const proposals = (data || []) as EvolutionProposal[];
    const markdown = renderBacklogMarkdown(proposals);

    return NextResponse.json({ markdown, count: proposals.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Backlog error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function renderBacklogMarkdown(proposals: EvolutionProposal[]): string {
  const lines: string[] = [];
  lines.push('# Catalyst 自己進化バックログ（自動生成）');
  lines.push('');
  lines.push(`生成日時: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('このファイルはユーザーの不満・欲求・操作データからAIが生成した改善提案です。');
  lines.push('実装エージェントは上から順に着手し、完了したら status を implemented に更新してください。');
  lines.push('');
  lines.push(`件数: ${proposals.length}`);
  lines.push('');

  if (proposals.length === 0) {
    lines.push('_承認済みの提案はありません。_');
    return lines.join('\n');
  }

  proposals.forEach((p, i) => {
    lines.push(`## ${i + 1}. [${p.category}] ${p.title}`);
    lines.push('');
    lines.push(`- 優先度: ${p.priority}`);
    if (p.target_area) lines.push(`- 対象: ${p.target_area}`);
    lines.push(`- 提案ID: ${p.id}`);
    lines.push('');
    lines.push('### 根拠');
    lines.push(p.rationale);
    lines.push('');
    if (p.proposed_change) {
      lines.push('### 変更案');
      lines.push(p.proposed_change);
      lines.push('');
    }
    if (p.evidence?.length) {
      lines.push('### 証拠');
      p.evidence.forEach((e) => lines.push(`- ${e}`));
      lines.push('');
    }
  });

  return lines.join('\n');
}
