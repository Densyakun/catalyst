'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { IdeaInboxItem, ProcessIdeaInboxResult } from '@/lib/types/ideas';

const STATUS_META: Record<
  IdeaInboxItem['status'],
  { label: string; color: string; bg: string }
> = {
  pending: { label: '処理待ち', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  processing: { label: '処理中', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  processed: { label: 'AI処理済み', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  failed: { label: '失敗', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  cancelled: { label: '取消済み', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
};

const AUTO_PROCESS_INTERVAL_MS = 5 * 60 * 1000;

export default function IdeaInboxPanel({ onProcessed }: { onProcessed?: () => void }) {
  const [items, setItems] = useState<IdeaInboxItem[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const processingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ideas/inbox');
      if (res.ok) {
        setItems(await res.json());
      }
    } catch (error) {
      console.error('Idea inbox load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const processPending = useCallback(
    async (announce: boolean) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      try {
        const res = await fetch('/api/ideas/inbox/process', { method: 'POST' });
        const data = (await res.json()) as ProcessIdeaInboxResult & { error?: string };
        if (!res.ok) throw new Error(data.error || 'AI処理に失敗しました');

        if (data.processed > 0) {
          onProcessed?.();
        }

        if (announce) {
          if (data.processed > 0) {
            setMessage(`${data.processed}件をAIで処理しました。`);
          } else if (data.remaining > 0) {
            setMessage('処理待ちのアイデアがあります。AIが利用可能になると自動で再試行します。');
          } else {
            setMessage('処理待ちのアイデアはありません。');
          }
        }

        await load();
      } catch (error) {
        console.error('Idea inbox processing error:', error);
        if (announce) {
          setMessage('AI処理に失敗しました。後で自動再試行します。');
        }
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [load, onProcessed],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await load();
      if (!cancelled) void processPending(false);
    };
    void run();

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void processPending(false);
    }, AUTO_PROCESS_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void processPending(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load, processPending]);

  const save = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setMessage('アイデアの内容を入力してください。');
      return;
    }

    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
      setMessage('処理日時が不正です。');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const isFuture = Boolean(scheduledDate && scheduledDate.getTime() > Date.now() + 5000);

      const res = await fetch('/api/ideas/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: trimmed,
          scheduled_at: scheduledDate && !Number.isNaN(scheduledDate.getTime())
            ? scheduledDate.toISOString()
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');

      setTitle('');
      setContent('');
      setScheduledAt('');
      await load();

      if (isFuture && scheduledDate) {
        setMessage(`保存しました。${scheduledDate.toLocaleString()}に処理します。`);
      } else {
        setMessage('保存しました。AI処理を試みます…');
        void processPending(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/ideas/inbox/${id}`, { method: 'DELETE' });
      await load();
    } catch (error) {
      console.error('Idea inbox delete error:', error);
    }
  };

  const retry = async (id: string) => {
    try {
      const res = await fetch(`/api/ideas/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      if (!res.ok) throw new Error('再試行の設定に失敗しました');
      await load();
      await processPending(true);
    } catch (error) {
      console.error('Idea inbox retry error:', error);
      setMessage('再試行の設定に失敗しました。');
    }
  };

  const pendingCount = items.filter((item) => item.status === 'pending').length;

  return (
    <div className="glass-panel" style={{ padding: '0.8rem' }}>
      <h3
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          margin: '0 0 0.4rem 0',
          fontSize: '0.85rem',
        }}
      >
        <Inbox size={14} className="text-accent" />
        アイデア保存
        {pendingCount > 0 && (
          <span
            style={{
              padding: '0.1rem 0.4rem',
              background: 'rgba(245, 158, 11, 0.18)',
              borderRadius: '10px',
              fontSize: '0.7rem',
              color: '#f59e0b',
            }}
          >
            {pendingCount}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => void processPending(true)}
            disabled={processing}
            title="処理待ちのアイデアを今すぐAIで処理"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.7rem',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '6px',
              color: 'var(--accent-color)',
              cursor: processing ? 'default' : 'pointer',
            }}
          >
            {processing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            AI処理
          </button>
        </span>
      </h3>

      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 0.6rem' }}>
        LLMが使えない時も保存できます。保存したアイデアは、AIが利用可能になったときに自動で構造化されます。
      </p>

      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        placeholder="タイトル（任意）"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '0.45rem 0.55rem',
          marginBottom: '0.4rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          color: 'white',
          fontSize: '0.8rem',
        }}
      />
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={5000}
        placeholder="アイデアを書いて保存（AIを通しません）"
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          padding: '0.45rem 0.55rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          color: 'white',
          fontSize: '0.8rem',
          fontFamily: 'inherit',
        }}
      />
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          marginTop: '0.4rem',
          fontSize: '0.7rem',
          color: 'var(--text-secondary)',
        }}
      >
        <Clock3 size={11} />
        <span style={{ flexShrink: 0 }}>処理予定</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '0.3rem 0.45rem',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--glass-border)',
            borderRadius: '6px',
            color: 'white',
            fontSize: '0.72rem',
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !content.trim()}
        style={{
          width: '100%',
          marginTop: '0.45rem',
          padding: '0.45rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.3rem',
          fontSize: '0.75rem',
          background: saving ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.18)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          borderRadius: '6px',
          color: 'var(--accent-color)',
          cursor: saving || !content.trim() ? 'default' : 'pointer',
          opacity: saving || !content.trim() ? 0.6 : 1,
        }}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        保存する
      </button>

      {message && (
        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.45rem 0 0' }}>
          {message}
        </p>
      )}

      {loading ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem' }}>
          読み込み中...
        </p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem' }}>
          保存されたアイデアはまだありません。
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.6rem' }}>
          {items.slice(0, 8).map((item) => {
            const meta = STATUS_META[item.status] ?? STATUS_META.pending;
            return (
              <div
                key={item.id}
                style={{
                  padding: '0.5rem 0.6rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                  {item.status === 'processed' ? (
                    <CheckCircle2 size={12} style={{ color: meta.color, flexShrink: 0 }} />
                  ) : item.status === 'failed' ? (
                    <AlertTriangle size={12} style={{ color: meta.color, flexShrink: 0 }} />
                  ) : (
                    <Clock3 size={12} style={{ color: meta.color, flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}
                  >
                    {item.title || item.content.slice(0, 40)}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      padding: '0.1rem 0.35rem',
                      background: meta.bg,
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      color: meta.color,
                      flexShrink: 0,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    margin: '0.3rem 0 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.content}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    marginTop: '0.3rem',
                    fontSize: '0.65rem',
                    color: 'var(--text-secondary)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                  {item.scheduled_at && (
                    <span>予定 {new Date(item.scheduled_at).toLocaleString()}</span>
                  )}
                  {item.attempts > 0 && <span>試行 {item.attempts}/{item.max_attempts}</span>}
                  {item.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => void retry(item.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.15rem',
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-color)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '0.65rem',
                      }}
                    >
                      <RefreshCw size={10} /> 再試行
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    title="削除"
                    style={{
                      marginLeft: 'auto',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {item.last_error && item.status !== 'processed' && (
                  <p
                    style={{
                      fontSize: '0.65rem',
                      color: '#ef4444',
                      margin: '0.3rem 0 0',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    AI処理に失敗しました。後で自動再試行します。
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
