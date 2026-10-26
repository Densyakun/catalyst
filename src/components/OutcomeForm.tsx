'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, MessageSquare, Send, XCircle } from 'lucide-react';

interface OutcomeFormProps {
  actionId: string;
  onSubmitted?: () => void;
}

export default function OutcomeForm({ actionId, onSubmitted }: OutcomeFormProps) {
  const [didExecute, setDidExecute] = useState<boolean | null>(null);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [complaint, setComplaint] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (didExecute === null) {
      setError('実行したかどうかを選んでください。');
      return;
    }

    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_id: actionId,
          did_execute: didExecute,
          satisfaction: satisfaction ?? undefined,
          complaint: complaint.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '記録に失敗しました');
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.8rem',
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          borderRadius: '10px',
          fontSize: '0.8rem',
          color: '#4ade80',
        }}
      >
        <CheckCircle2 size={16} />
        記録しました。次回の提案に反映します。
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--glass-border)',
        borderRadius: '12px',
      }}
    >
      <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
        <MessageSquare size={14} className="text-accent" />
        この一歩はどうでしたか？
      </h4>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>
        1タップで記録できます。結果は次の提案に使われます。
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.7rem' }}>
        <button
          type="button"
          onClick={() => setDidExecute(true)}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            borderRadius: '8px',
            border: `1px solid ${didExecute === true ? 'rgba(34, 197, 94, 0.6)' : 'var(--glass-border)'}`,
            background: didExecute === true ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.03)',
            color: didExecute === true ? '#4ade80' : 'white',
          }}
        >
          <CheckCircle2 size={14} /> 実行した
        </button>
        <button
          type="button"
          onClick={() => setDidExecute(false)}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            borderRadius: '8px',
            border: `1px solid ${didExecute === false ? 'rgba(245, 158, 11, 0.6)' : 'var(--glass-border)'}`,
            background: didExecute === false ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)',
            color: didExecute === false ? '#f59e0b' : 'white',
          }}
        >
          <XCircle size={14} /> まだ
        </button>
      </div>

      {didExecute !== false && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>満足度:</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSatisfaction(n === satisfaction ? null : n)}
              aria-label={`${n}点`}
              style={{
                background: 'none',
                border: 'none',
                padding: '0 0.1rem',
                fontSize: '1rem',
                color: (satisfaction ?? 0) >= n ? 'var(--warning-color)' : 'var(--text-secondary)',
              }}
            >
              ★
            </button>
          ))}
        </div>
      )}

      <textarea
        value={complaint}
        onChange={(event) => setComplaint(event.target.value)}
        placeholder="うまくいかなかった点、不満、気づいたこと（任意）"
        rows={2}
        style={{
          width: '100%',
          resize: 'vertical',
          padding: '0.5rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          color: 'white',
          fontFamily: 'inherit',
          fontSize: '0.78rem',
        }}
      />

      {error && (
        <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.4rem' }}>{error}</p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={sending}
        className="btn-primary"
        style={{
          marginTop: '0.6rem',
          width: '100%',
          padding: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.35rem',
          fontSize: '0.8rem',
        }}
      >
        {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
        記録する
      </button>
    </div>
  );
}
