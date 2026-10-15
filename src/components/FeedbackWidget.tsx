'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircleWarning, X, Send } from 'lucide-react';
import { trackEvent } from '@/lib/telemetry';
import type { FeedbackCategory } from '@/lib/types/evolution';

const CATEGORIES: Array<{ key: FeedbackCategory; label: string }> = [
  { key: 'dissatisfaction', label: '不満' },
  { key: 'desire', label: '欲求' },
  { key: 'interest', label: '興味' },
  { key: 'bug', label: '不具合' },
  { key: 'praise', label: '良い' },
];

/**
 * FeedbackWidget:
 * ユーザーの不満・欲求・興味をその場で収集し、自己進化エンジンの入力にする。
 * 送信された内容は /api/feedback に保存される。
 */
export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('dissatisfaction');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!message.trim() && rating === null) return;
    setSending(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          rating: rating ?? undefined,
          context_path: pathname,
        }),
      });
      if (!res.ok) throw new Error('failed');
      void trackEvent('feedback_submitted', { category, has_message: Boolean(message.trim()) });
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setOpen(false);
        setMessage('');
        setRating(null);
        setCategory('dissatisfaction');
      }, 1400);
    } catch {
      alert('送信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button className="feedback-fab" onClick={() => setOpen(true)} aria-label="フィードバックを送る">
        <MessageCircleWarning size={16} /> フィードバック
      </button>
    );
  }

  return (
    <div className="feedback-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>アプリを改善する</strong>
        <button onClick={() => setOpen(false)} style={{ background: 'none', padding: 0, color: 'var(--text-secondary)' }} aria-label="閉じる">
          <X size={16} />
        </button>
      </div>

      {done ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--success-color)' }}>ありがとうございます。改善に活用します。</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.6rem' }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={`feedback-chip ${category === c.key ? 'active' : ''}`}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <textarea
            className="feedback-textarea"
            placeholder="気づいたこと・困っていること・こうしたい、を自由に書いてください"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {rating === null ? '評価（任意）: ' : `評価: ${rating}/5  `}
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n === rating ? null : n)}
                  aria-label={`${n}点`}
                  style={{ background: 'none', padding: '0 0.1rem', fontSize: '0.85rem', color: (rating ?? 0) >= n ? 'var(--warning-color)' : 'var(--text-secondary)' }}
                >
                  ★
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={submit} disabled={sending} style={{ padding: '0.45rem 0.9rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Send size={12} /> {sending ? '送信中' : '送信'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
