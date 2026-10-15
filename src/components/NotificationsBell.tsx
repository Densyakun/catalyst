'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Sparkles } from 'lucide-react';
import type { UserNotification } from '@/lib/types/evolution';

/**
 * NotificationsBell:
 * エージェントが報告した改善結果（user_notifications）をユーザーへ表示する。
 * 30秒ごとにポーリングして更新する。
 */
export default function NotificationsBell() {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      setItems(await res.json());
    } catch {
      // 通知取得失敗は無視
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    } catch {
      // 失敗しても致命的ではない
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
    } catch {
      // 失敗しても致命的ではない
    }
  };

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="通知"
        style={{ background: 'none', padding: '0.3rem', color: 'white', position: 'relative', display: 'flex' }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: '-2px', right: '-2px', background: 'var(--danger-color)', color: 'white', borderRadius: '999px', fontSize: '0.55rem', minWidth: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: '130%', width: 'min(320px, calc(100vw - 2rem))', background: 'rgba(15,15,20,0.98)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '0.6rem', zIndex: 70, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <strong style={{ fontSize: '0.78rem' }}>通知</strong>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <CheckCheck size={11} /> すべて既読
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>通知はまだありません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '320px', overflowY: 'auto' }}>
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  style={{ textAlign: 'left', background: n.is_read ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.1)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.45rem', width: '100%' }}
                >
                  <p style={{ fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sparkles size={11} className="text-accent" /> {n.title}
                  </p>
                  {n.body && <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.4 }}>{n.body}</p>}
                  <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{new Date(n.created_at).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
