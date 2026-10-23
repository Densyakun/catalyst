'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';
import type { UserNotification } from '@/lib/types/evolution';

function linkLabel(url: string): string {
  if (/github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(url)) return 'GitHub Issue を開く';
  if (/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)) return 'GitHub PR を開く';
  return 'リンクを開く';
}

/**
 * NotificationsBell:
 * エージェントが報告した改善結果（user_notifications）をユーザーへ表示する。
 * 30秒ごとにポーリングして更新する。
 */
export default function NotificationsBell() {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
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

  const toggle = (n: UserNotification) => {
    if (!n.is_read) void markRead(n.id);
    setExpandedId((prev) => (prev === n.id ? null : n.id));
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
        <div className="notifications-panel">
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
              {items.map((n) => {
                const hasDetail = Boolean(n.detail && n.detail !== n.body);
                const isExpanded = expandedId === n.id;
                const linkUrl = n.link_url && /^https?:\/\//i.test(n.link_url) ? n.link_url : null;
                return (
                  <div
                    key={n.id}
                    className="notification-item"
                    style={{ background: n.is_read ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.1)' }}
                  >
                    <button
                      onClick={() => toggle(n)}
                      aria-expanded={isExpanded}
                      style={{ background: 'none', padding: 0, width: '100%', textAlign: 'left', color: 'inherit' }}
                    >
                      <p className="notification-title" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                        <Sparkles size={11} className="text-accent" style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                        <span style={{ minWidth: 0 }}>{n.title}</span>
                      </p>
                      {n.body && <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{n.body}</p>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{new Date(n.created_at).toLocaleString()}</span>
                        {hasDetail && (
                          <span style={{ fontSize: '0.6rem', color: 'var(--accent-color)', display: 'inline-flex', alignItems: 'center', gap: '0.15rem', flexShrink: 0 }}>
                            {isExpanded ? <><ChevronUp size={10} /> 閉じる</> : <><ChevronDown size={10} /> 詳細</>}
                          </span>
                        )}
                      </div>
                    </button>
                    {isExpanded && hasDetail && (
                      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderTop: '1px solid var(--glass-border)', paddingTop: '0.35rem' }}>
                        {n.detail}
                      </p>
                    )}
                    {linkUrl && (
                      <a
                        href={linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '0.65rem', color: 'var(--accent-color)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.3rem' }}
                      >
                        <ExternalLink size={10} /> {linkLabel(linkUrl)}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
