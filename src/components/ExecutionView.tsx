'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Lightbulb, Link2, ShieldAlert } from 'lucide-react';
import OutcomeForm from './OutcomeForm';

export interface ExecutionResultData {
  summary?: string;
  details?: { title: string; content: string; link?: string }[];
  next_steps?: string[];
  advice?: string;
}

interface ExecutionViewProps {
  result: ExecutionResultData;
  actionId?: string | null;
  actionDescription?: string | null;
  onBack: () => void;
  backLabel?: string;
  onOutcomeSubmitted?: () => void;
}

export default function ExecutionView({
  result,
  actionId,
  actionDescription,
  onBack,
  backLabel = '戻る',
  onOutcomeSubmitted,
}: ExecutionViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ padding: 'clamp(1rem, 4vw, 2.5rem)', maxWidth: '900px', margin: '0 auto' }}
    >
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
          marginBottom: '1.5rem',
          padding: 0,
          fontSize: '0.85rem',
        }}
      >
        <ArrowLeft size={18} /> {backLabel}
      </button>

      <h2 style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>リサーチ結果と実行計画</h2>
      {actionDescription && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
          対象: {actionDescription}
        </p>
      )}

      <div
        style={{
          marginBottom: '1.5rem',
          padding: '1rem 1.2rem',
          background: 'rgba(99, 102, 241, 0.06)',
          borderRadius: '12px',
          border: '1px solid rgba(99, 102, 241, 0.35)',
        }}
      >
        <p style={{ fontSize: '0.95rem', lineHeight: 1.7 }}>
          {result.summary || '要約を取得できませんでした。'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
        {result.details?.map((detail, i) => (
          <div key={i} style={{ borderLeft: '3px solid var(--accent-color)', paddingLeft: '1rem' }}>
            <h4 style={{ fontSize: '1rem', marginBottom: '0.3rem' }}>{detail.title}</h4>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.85rem' }}>
              {detail.content}
            </p>
            {detail.link && (
              <a
                href={detail.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  color: 'var(--accent-color)',
                  marginTop: '0.3rem',
                }}
              >
                <Link2 size={12} /> 参照リンク
              </a>
            )}
          </div>
        ))}
      </div>

      <section style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', fontSize: '1rem' }}>
          <CheckCircle2 className="text-accent" size={18} /> 次にとるべきステップ
        </h3>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {result.next_steps?.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.8rem',
                padding: '0.7rem 0.8rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '10px',
              }}
            >
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: 'var(--accent-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                }}
              >
                {i + 1}
              </div>
              <p style={{ fontSize: '0.85rem', minWidth: 0, overflowWrap: 'anywhere' }}>{step}</p>
            </div>
          ))}
          {(!result.next_steps || result.next_steps.length === 0) && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>次のステップを生成できませんでした。</p>
          )}
        </div>
      </section>

      {result.advice && (
        <div
          style={{
            display: 'flex',
            gap: '0.6rem',
            padding: '0.9rem 1rem',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '10px',
            marginBottom: '0.5rem',
          }}
        >
          <ShieldAlert size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.15rem' }} />
          <div>
            <p style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.15rem' }}>
              後悔しないためのアドバイス
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{result.advice}</p>
          </div>
        </div>
      )}

      {actionId ? (
        <OutcomeForm actionId={actionId} onSubmitted={onOutcomeSubmitted} />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginTop: '0.8rem',
          }}
        >
          <Lightbulb size={13} />
          この結果を今日の振り返りとして記録できます。
        </div>
      )}
    </motion.div>
  );
}
