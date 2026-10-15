'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dna, Sparkles, Trash2, RefreshCw, Download, Wand2, Check, X, Loader2, CircleCheck, FlaskConical, ExternalLink } from 'lucide-react';
import type { EvolutionProposal, ProposalStatus, UIVariant } from '@/lib/types/evolution';

const CATEGORY_LABEL: Record<string, string> = {
  feature: '新機能',
  ux: 'UX',
  bug: '不具合',
  performance: '性能',
  content: '内容',
};

const STATUS_LABEL: Record<string, string> = {
  proposed: '提案',
  approved: '承認済',
  in_progress: '実装中',
  implemented: '実装済',
  rejected: '却下',
};

const DASHBOARD_AREA = 'dashboard_focus';

/**
 * EvolutionPanel:
 * 自己進化エンジンのダッシュボード。シグナル分析→改善提案の承認→
 * 実装バックログ出力、および動的UI（tsx-safe-eval）の生成・適用を行う。
 */
export default function EvolutionPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [variants, setVariants] = useState<UIVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [genUI, setGenUI] = useState(false);
  const [summary, setSummary] = useState('');

  const load = useCallback(async () => {
    try {
      const [pRes, vRes] = await Promise.all([
        fetch('/api/evolution'),
        fetch(`/api/ui-variants?area=${DASHBOARD_AREA}`),
      ]);
      if (pRes.ok) setProposals(await pRes.json());
      if (vRes.ok) setVariants(await vRes.json());
    } catch (err) {
      console.error('Evolution load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/evolution', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'analysis failed');
      setSummary(data.summary || '');
      await load();
    } catch (err) {
      alert('分析に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAnalyzing(false);
    }
  };

  const updateStatus = async (id: string, status: ProposalStatus) => {
    try {
      const res = await fetch(`/api/evolution/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('failed');
      await load();
    } catch {
      alert('更新に失敗しました');
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/evolution/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      alert('削除に失敗しました');
    }
  };

  const exportBacklog = async () => {
    try {
      const res = await fetch('/api/evolution/backlog?write=1', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      const blob = new Blob([data.markdown || ''], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'self-improvement.md';
      a.click();
      URL.revokeObjectURL(url);
      if (data.count === 0) alert('承認済みの提案がありません。先に提案を承認してください。');
    } catch (err) {
      alert('出力に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const optimizeUI = async () => {
    setGenUI(true);
    try {
      const res = await fetch('/api/ui-variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: DASHBOARD_AREA, instruction: 'ダッシュボードの最重要課題を目立たせる' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      await load();
    } catch (err) {
      alert('UI生成に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGenUI(false);
    }
  };

  const activateVariant = async (id: string, status: 'active' | 'archived') => {
    try {
      await fetch(`/api/ui-variants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await load();
    } catch {
      alert('更新に失敗しました');
    }
  };

  const pending = proposals.filter((p) => p.status === 'proposed' || p.status === 'approved' || p.status === 'in_progress');
  const done = proposals.filter((p) => p.status === 'implemented' || p.status === 'rejected');

  return (
    <section className="glass-panel" style={{ padding: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <h3 style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Dna size={14} className="text-accent" /> 自己進化
        </h3>
        <button
          onClick={analyze}
          disabled={analyzing}
          style={{ background: 'none', color: 'var(--accent-color)', fontSize: '0.7rem', padding: '0.2rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
        >
          {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          分析
        </button>
      </div>

      {summary && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', lineHeight: 1.5 }}>{summary}</p>
      )}

      {loading ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>読み込み中...</p>
      ) : pending.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          提案はまだありません。「分析」でユーザーの声と操作データから改善案を生成します。
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {pending.map((p) => (
            <div key={p.id} className="evolution-proposal">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                <div>
                  <span className="evolution-cat">{CATEGORY_LABEL[p.category] || p.category}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                    {STATUS_LABEL[p.status]} ・ 優先度 {Math.round((p.priority || 0) * 100)}
                  </span>
                </div>
                <button onClick={() => remove(p.id)} style={{ background: 'none', padding: 0, color: 'var(--text-secondary)' }} aria-label="削除">
                  <Trash2 size={12} />
                </button>
              </div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, margin: '0.3rem 0 0.2rem' }}>{p.title}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.rationale}</p>
              {p.proposed_change && (
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--accent-color)' }}>変更案:</strong> {p.proposed_change}
                </p>
              )}
              {p.evidence?.length > 0 && (
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.8, marginTop: '0.3rem' }}>
                  根拠: {p.evidence.slice(0, 2).join(' / ')}
                </p>
              )}
              {p.github_issue_url && (
                <a
                  href={p.github_issue_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.65rem', color: 'var(--accent-color)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.3rem' }}
                >
                  <ExternalLink size={10} /> Issue #{p.github_issue_number} を開く
                </a>
              )}
              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {p.status === 'proposed' && (
                  <button onClick={() => updateStatus(p.id, 'approved')} style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success-color)', padding: '0.25rem 0.5rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Check size={10} /> 承認
                  </button>
                )}
                <button onClick={() => updateStatus(p.id, 'implemented')} style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-color)', padding: '0.25rem 0.5rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <CircleCheck size={10} /> 実装済
                </button>
                <button onClick={() => updateStatus(p.id, 'rejected')} style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--danger-color)', padding: '0.25rem 0.5rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <X size={10} /> 却下
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', opacity: 0.7 }}>
          完了/却下: {done.length}件
        </p>
      )}

      {/* 動的UI（tsx-safe-eval） */}
      <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: '0.7rem', paddingTop: '0.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)' }}>
            <FlaskConical size={12} /> UI最適化（再デプロイ不要）
          </span>
          <button onClick={optimizeUI} disabled={genUI} style={{ background: 'none', color: 'var(--accent-color)', fontSize: '0.68rem', padding: '0.2rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {genUI ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} 生成
          </button>
        </div>
        {variants.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem' }}>
            {variants.slice(0, 4).map((v) => (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.name} {v.status === 'active' ? '（適用中）' : ''}
                </span>
                {v.status === 'active' ? (
                  <button onClick={() => activateVariant(v.id, 'archived')} style={{ background: 'none', color: 'var(--text-secondary)', fontSize: '0.62rem', padding: 0 }}>解除</button>
                ) : (
                  <button onClick={() => activateVariant(v.id, 'active')} style={{ background: 'none', color: 'var(--accent-color)', fontSize: '0.62rem', padding: 0 }}>適用</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={exportBacklog}
        style={{ marginTop: '0.7rem', width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', padding: '0.4rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
      >
        <Download size={12} /> 実装バックログを出力
      </button>
      <button
        onClick={load}
        style={{ marginTop: '0.4rem', width: '100%', background: 'none', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
      >
        <RefreshCw size={11} /> 再読み込み
      </button>
    </section>
  );
}
