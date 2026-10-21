'use client';

import { useCallback, useEffect, useState } from 'react';
import { Key, Plus, Copy, Trash2, Check, Loader2, ShieldCheck } from 'lucide-react';

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/**
 * APITokensPanel:
 * エージェント/MCPが使うユーザーAPIトークンを発行・失効する。
 * 平文は発行時に一度だけ表示する。
 */
export default function APITokensPanel() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens');
      if (res.ok) setTokens(await res.json());
    } catch {
      // 取得失敗は無視
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'default' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setIssued(data.token);
      setName('');
      await load();
    } catch (err) {
      alert('発行に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('このトークンを失効させますか？')) return;
    try {
      await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      alert('失効に失敗しました');
    }
  };

  const copyIssued = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボード不可の環境では手動コピー
    }
  };

  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <section className="glass-panel" style={{ padding: '0.8rem' }}>
      <h3 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Key size={14} className="text-accent" /> APIトークン
      </h3>
      <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', lineHeight: 1.5 }}>
        エージェント/MCPがあなたのデータを読み書きするためのトークンです。平文は発行時に一度だけ表示されます。
      </p>

      {issued && (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid var(--success-color)', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.6rem' }}>
          <p style={{ fontSize: '0.68rem', color: 'var(--success-color)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <ShieldCheck size={12} /> このトークンは再表示できません
          </p>
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: '0.68rem', wordBreak: 'break-all', background: 'rgba(0,0,0,0.3)', padding: '0.3rem', borderRadius: '6px' }}>{issued}</code>
            <button onClick={copyIssued} style={{ background: 'rgba(255,255,255,0.08)', padding: '0.3rem 0.5rem', color: 'white' }} aria-label="コピー">
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前（例: mcp-agent）"
          style={{ flex: 1, minWidth: 0, padding: '0.4rem 0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', fontSize: '0.72rem' }}
        />
        <button onClick={create} disabled={creating} className="btn-primary" style={{ padding: '0.4rem 0.7rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} 発行
        </button>
      </div>

      {active.length === 0 ? (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>有効なトークンはありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {active.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.4rem 0.5rem', minWidth: 0 }}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>{t.token_prefix}…</span>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                  {t.last_used_at ? `最終使用: ${new Date(t.last_used_at).toLocaleString()}` : '未使用'}
                </div>
              </div>
              <button onClick={() => revoke(t.id)} style={{ background: 'none', color: 'var(--danger-color)', padding: '0.2rem', display: 'flex' }} aria-label="失効">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
