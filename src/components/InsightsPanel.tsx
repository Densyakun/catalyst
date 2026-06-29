'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb, Play, Pause, FileEdit, ChevronDown, ChevronUp,
  Loader2, Zap, Clock, AlertTriangle, CheckCircle2, Eye, FolderKanban, Trash2,
} from 'lucide-react';
import type { AutoInsight, DiffData, DiffChange } from '@/lib/types/sources';

export default function InsightsPanel() {
  const [insights, setInsights] = useState<AutoInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const fetchInsights = async () => {
    try {
      const res = await fetch('/api/insights');
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleDecompose = async (insight: AutoInsight) => {
    setProjectLoading(insight.id);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insight_id: insight.id,
          title: insight.title,
          description: insight.content,
          is_social: false,
        }),
      });
      if (res.ok) {
        fetchInsights();
      }
    } catch (err) {
      console.error('Decompose error:', err);
    } finally {
      setProjectLoading(null);
    }
  };

  const handleDelete = async (insightId: string) => {
    setDeleteLoading(insightId);
    try {
      const res = await fetch('/api/insights', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: insightId }),
      });
      if (res.ok) {
        fetchInsights();
      }
    } catch (err) {
      console.error('Insight delete error:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleAction = async (insightId: string, action: 'proceed' | 'hold') => {
    setActionLoading(insightId);
    try {
      const res = await fetch(`/api/insights/${insightId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchInsights();
      }
    } catch (err) {
      console.error('Insight action error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (insight: AutoInsight) => {
    if (insight.auto_proceed && insight.status === 'in_progress') {
      return (
        <span
          title="低コスト・低リスクと判断し自動で進行中"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            padding: '0.15rem 0.4rem',
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '4px',
            fontSize: '0.7rem',
            color: '#22c55e',
          }}>
          <Zap size={10} /> 自動実行中
        </span>
      );
    }

    const statusMap: Record<string, { label: string; color: string; bg: string }> = {
      pending: { label: '確認待ち', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
      in_progress: { label: '進行中', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
      completed: { label: '完了', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
      on_hold: { label: '保留中', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
    };

    const s = statusMap[insight.status] || statusMap.pending;
    return (
      <span style={{
        padding: '0.15rem 0.4rem',
        background: s.bg,
        borderRadius: '4px',
        fontSize: '0.7rem',
        color: s.color,
      }}>
        {s.label}
      </span>
    );
  };

  const parseUrgency = (insight: AutoInsight): 'low' | 'medium' | 'high' => {
    const match = insight.content.match(/緊急度:\s*(low|medium|high)/);
    return (match?.[1] as 'low' | 'medium' | 'high') || 'low';
  };

  const getUrgencyBadge = (insight: AutoInsight) => {
    const urgency = parseUrgency(insight);
    const urgencyMap = {
      high: { label: '高', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' },
      medium: { label: '中', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' },
      low: { label: '低', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', border: 'rgba(107, 114, 128, 0.3)' },
    };
    const u = urgencyMap[urgency];
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.15rem',
        padding: '0.1rem 0.35rem',
        background: u.bg,
        border: `1px solid ${u.border}`,
        borderRadius: '4px',
        fontSize: '0.65rem',
        color: u.color,
        fontWeight: 600,
      }}>
        {urgency === 'high' && <AlertTriangle size={9} />}
        {u.label}
      </span>
    );
  };

  const getUrgencyIcon = (insight: AutoInsight) => {
    const urgency = parseUrgency(insight);
    if (urgency === 'high') {
      return <AlertTriangle size={14} style={{ color: '#ef4444' }} />;
    }
    if (urgency === 'medium') {
      return <AlertTriangle size={14} style={{ color: '#f59e0b' }} />;
    }
    return <Lightbulb size={14} style={{ color: 'var(--accent-color)' }} />;
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (insights.length === 0) {
    return null;
  }

  const activeInsights = insights.filter((i) => i.status !== 'completed');
  const completedInsights = insights.filter((i) => i.status === 'completed');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ padding: '0.8rem', marginBottom: 0 }}
    >
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
        <Lightbulb size={14} className="text-accent" />
        自動インサイト
        {activeInsights.length > 0 && (
          <span style={{
            padding: '0.1rem 0.4rem',
            background: 'rgba(99, 102, 241, 0.2)',
            borderRadius: '10px',
            fontSize: '0.7rem',
            color: 'var(--accent-color)',
          }}>
            {activeInsights.length}
          </span>
        )}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {activeInsights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            expanded={expandedId === insight.id}
            onToggle={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
            onAction={handleAction}
            actionLoading={actionLoading === insight.id}
            onDecompose={handleDecompose}
            projectLoading={projectLoading === insight.id}
            onDelete={handleDelete}
            deleteLoading={deleteLoading === insight.id}
            getStatusBadge={getStatusBadge}
            getUrgencyIcon={getUrgencyIcon}
            getUrgencyBadge={getUrgencyBadge}
          />
        ))}
      </div>

      {completedInsights.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <CheckCircle2 size={12} />
            完了済み ({completedInsights.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
            {completedInsights.slice(0, 5).map((insight) => (
              <div key={insight.id} style={{
                padding: '0.4rem 0.6rem',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}>
                <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
                {insight.title}
              </div>
            ))}
          </div>
        </details>
      )}
    </motion.div>
  );
}

function InsightCard({
  insight,
  expanded,
  onToggle,
  onAction,
  actionLoading,
  onDecompose,
  projectLoading,
  onDelete,
  deleteLoading,
  getStatusBadge,
  getUrgencyIcon,
  getUrgencyBadge,
}: {
  insight: AutoInsight;
  expanded: boolean;
  onToggle: () => void;
  onAction: (id: string, action: 'proceed' | 'hold') => void;
  actionLoading: boolean;
  onDecompose: (insight: AutoInsight) => void;
  projectLoading: boolean;
  onDelete: (id: string) => void;
  deleteLoading: boolean;
  getStatusBadge: (i: AutoInsight) => React.ReactNode;
  getUrgencyIcon: (i: AutoInsight) => React.ReactNode;
  getUrgencyBadge: (i: AutoInsight) => React.ReactNode;
}) {
  return (
    <motion.div
      layout
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        border: '1px solid var(--glass-border)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.7rem 0.8rem',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          {getUrgencyIcon(insight)}
          <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {insight.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {insight.insight_type === 'detected_problem' && getUrgencyBadge(insight)}
          {insight.estimated_cost && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.15rem',
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
            }}>
              <Clock size={9} />
              {insight.estimated_cost.time}
            </span>
          )}
          {getStatusBadge(insight)}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 0.8rem 0.8rem', borderTop: '1px solid var(--glass-border)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.7rem 0', whiteSpace: 'pre-wrap' }}>
                {insight.content}
              </p>

              {insight.estimated_cost && (
                <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '0.7rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={12} /> {insight.estimated_cost.time}
                  </span>
                  {insight.estimated_cost.money > 0 && (
                    <span>¥{insight.estimated_cost.money.toLocaleString()}</span>
                  )}
                </div>
              )}

              {/* メモ書き換えのdiff表示 */}
              {insight.insight_type === 'memo_rewrite' && insight.diff_data && (
                <DiffView diffData={insight.diff_data as DiffData} />
              )}

              {/* プロジェクト化ボタン */}
              {insight.status === 'pending' && insight.estimated_cost && insight.estimated_cost.money >= 50 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecompose(insight);
                  }}
                  disabled={projectLoading}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    fontSize: '0.75rem',
                    background: 'rgba(139, 92, 246, 0.1)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '6px',
                    color: '#8b5cf6',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.3rem',
                    marginTop: '0.3rem',
                    marginBottom: '0.3rem',
                  }}
                >
                  {projectLoading ? <Loader2 className="animate-spin" size={12} /> : <FolderKanban size={12} />}
                  プロジェクト化（タスク分割）
                </button>
              )}

              {/* アクションボタン */}
              {insight.status === 'pending' && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction(insight.id, 'proceed'); }}
                    disabled={actionLoading}
                    className="btn-primary"
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                    進める
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAction(insight.id, 'hold'); }}
                    disabled={actionLoading}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      fontSize: '0.8rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <Pause size={14} />
                    保留する
                  </button>
                </div>
              )}

              {/* 削除ボタン */}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(insight.id); }}
                disabled={deleteLoading}
                style={{
                  width: '100%',
                  padding: '0.35rem',
                  fontSize: '0.7rem',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '6px',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.2rem',
                  marginTop: '0.5rem',
                  opacity: deleteLoading ? 0.5 : 1,
                }}
              >
                {deleteLoading ? <Loader2 className="animate-spin" size={10} /> : <Trash2 size={10} />}
                削除
              </button>

              {insight.status === 'on_hold' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAction(insight.id, 'proceed'); }}
                  disabled={actionLoading}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.8rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer',
                    marginTop: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <Play size={14} />
                  やっぱり進める
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DiffView({ diffData }: { diffData: DiffData }) {
  const [showFull, setShowFull] = useState(false);
  const changedLines = diffData.changes.filter((c) => c.type !== 'unchanged');

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
        <FileEdit size={12} style={{ color: 'var(--accent-color)' }} />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {changedLines.length}箇所の変更
        </span>
        <button
          onClick={() => setShowFull(!showFull)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-color)',
            fontSize: '0.7rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.2rem',
          }}
        >
          <Eye size={10} />
          {showFull ? '変更のみ表示' : '全文表示'}
        </button>
      </div>
      <div style={{
        maxHeight: '200px',
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '6px',
        padding: '0.5rem',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        lineHeight: 1.6,
      }}>
        {(showFull ? diffData.changes : changedLines).map((change, i) => (
          <DiffLine key={i} change={change} />
        ))}
      </div>
    </div>
  );
}

function DiffLine({ change }: { change: DiffChange }) {
  const colorMap = {
    unchanged: { bg: 'transparent', color: 'var(--text-secondary)', prefix: ' ' },
    added: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', prefix: '+' },
    removed: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', prefix: '-' },
    modified: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', prefix: '~' },
  };

  const style = colorMap[change.type];

  if (change.type === 'modified') {
    return (
      <div>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.1rem 0.3rem', color: '#ef4444' }}>
          - {change.original}
        </div>
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '0.1rem 0.3rem', color: '#22c55e' }}>
          + {change.revised}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: style.bg, padding: '0.1rem 0.3rem', color: style.color }}>
      {style.prefix} {change.type === 'removed' ? change.original : change.revised || change.original}
    </div>
  );
}
