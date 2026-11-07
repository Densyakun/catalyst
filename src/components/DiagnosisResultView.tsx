'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Target, Zap } from 'lucide-react';

interface DiagnosisAction {
  id?: string;
  description?: string;
  reason?: string;
  is_recommended?: boolean;
  cost?: { time?: string; money?: number } | null;
  [key: string]: unknown;
}

interface DiagnosisProblem {
  id?: string;
  context: string;
  goal?: string;
  priority_score?: number | string | null;
  personal_priority?: number | string | null;
  social_impact?: number | string | null;
  priority_reason?: string | null;
  [key: string]: unknown;
}

function formatPercent(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${Math.round(num * 100)}`;
}

interface DiagnosisResultViewProps {
  result: {
    results: Array<{
      problem: DiagnosisProblem;
      actions: DiagnosisAction[];
    }>;
  };
  onExecute: (action: DiagnosisAction, problem: DiagnosisProblem) => void;
  onBack: () => void;
}

export default function DiagnosisResultView({ result, onExecute, onBack }: DiagnosisResultViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-panel"
      style={{ padding: 'clamp(1rem, 4vw, 2.5rem)', maxWidth: '900px', margin: '0 auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: 0,
            fontSize: '0.85rem',
          }}
        >
          <ArrowLeft size={18} /> 課題一覧に戻る
        </button>
        <h2 style={{ fontSize: '1.5rem', margin: 0 }}>
          {result.results.length > 1 ? `${result.results.length}個の課題が見つかりました` : '診断結果'}
        </h2>
      </div>

      {result.results.map((res, idx) => (
        <div
          key={idx}
          style={{
            marginBottom: idx < result.results.length - 1 ? '2.5rem' : 0,
            paddingBottom: idx < result.results.length - 1 ? '2.5rem' : 0,
            borderBottom: idx < result.results.length - 1 ? '1px solid var(--glass-border)' : 'none',
          }}
        >
          <section style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ color: 'var(--accent-color)', marginBottom: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
              <Zap size={18} /> 課題 {result.results.length > 1 ? idx + 1 : ''}: {res.problem.context.slice(0, 30)}...
            </h3>
            <div style={{ padding: '1rem 1.2rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '0.6rem', fontSize: '0.85rem' }}>
                {res.problem.context}
              </p>
              <p style={{ fontWeight: 600, marginBottom: '0.2rem', fontSize: '0.85rem' }}>想定されるゴール:</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{res.problem.goal}</p>

              {(res.problem.priority_score != null || res.problem.personal_priority != null) && (
                <div
                  style={{
                    marginTop: '0.8rem',
                    padding: '0.7rem 0.8rem',
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    borderRadius: '10px',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.3rem' }}>優先度の根拠</p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem 1rem',
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>総合: {formatPercent(res.problem.priority_score)}</span>
                    <span>個人: {formatPercent(res.problem.personal_priority)}</span>
                    <span>社会: {formatPercent(res.problem.social_impact)}</span>
                  </div>
                  {res.problem.priority_reason && (
                    <p style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {res.problem.priority_reason}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 style={{ marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
              <Target size={18} /> 推奨されるアクション
            </h3>
            <div style={{ display: 'grid', gap: '0.7rem' }}>
              {res.actions.map((action, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.01 }}
                  style={{
                    padding: '1rem 1.2rem',
                    background: action.is_recommended
                      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))'
                      : 'rgba(255,255,255,0.02)',
                    borderRadius: '12px',
                    border: action.is_recommended ? '1px solid var(--accent-color)' : '1px solid var(--glass-border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => onExecute(action, res.problem)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.95rem', minWidth: 0, overflowWrap: 'anywhere' }}>{action.description}</h4>
                    <ChevronRight size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>{action.reason}</p>
                  {action.cost?.time && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                      目安: {action.cost.time}
                      {typeof action.cost.money === 'number' && action.cost.money > 0 ? ` / ¥${action.cost.money.toLocaleString()}` : ''}
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      ))}
    </motion.div>
  );
}
