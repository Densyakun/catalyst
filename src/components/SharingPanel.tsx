'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Clock3,
  Copy,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { UserResource } from '@/lib/types/engine';
import type { FundsSnapshot, FundPurpose } from '@/lib/types/funds';
import type {
  ReceivedShare,
  ResourceShare,
  ShareEvent,
  ShareType,
  SharingSnapshot,
} from '@/lib/types/sharing';

const SHARE_TYPE_LABEL: Record<ShareType, string> = {
  money: '資金',
  resource: 'リソース',
  api: 'API',
  mcp: 'MCP',
};

const STATUS_LABEL: Record<string, string> = {
  active: '有効',
  revoked: '取消済み',
  expired: '期限切れ',
  exhausted: '上限到達',
};

const EVENT_LABEL: Record<string, string> = {
  created: '作成',
  redeemed: 'コード利用',
  authorized: '利用',
  denied: '拒否',
  revoked: '取消',
};

function parsePositive(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

function parseNonNegativeInteger(value: string): number {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

export default function SharingPanel({
  refreshKey = 0,
  onChanged,
}: {
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<SharingSnapshot>({ owned: [], received: [] });
  const [events, setEvents] = useState<ShareEvent[]>([]);
  const [resources, setResources] = useState<UserResource[]>([]);
  const [purposes, setPurposes] = useState<FundPurpose[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const [shareType, setShareType] = useState<ShareType>('money');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [purposeId, setPurposeId] = useState('');
  const [amountLimit, setAmountLimit] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['read']);
  const [maxUses, setMaxUses] = useState('0');
  const [expiresAt, setExpiresAt] = useState('');

  const [redeemCode, setRedeemCode] = useState('');
  const [useAmounts, setUseAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [sharingRes, resourcesRes, fundsRes, eventsRes] = await Promise.all([
        fetch('/api/sharing'),
        fetch('/api/resources'),
        fetch('/api/funds'),
        fetch('/api/sharing/events'),
      ]);

      if (sharingRes.ok) setSnapshot(await sharingRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (resourcesRes.ok) {
        const nextResources = (await resourcesRes.json() as UserResource[])
          .filter((resource) => resource.resource_type !== 'money');
        setResources(nextResources);
        setResourceId((current) => current || nextResources[0]?.id || '');
      }
      if (fundsRes.ok) {
        const funds = await fundsRes.json() as FundsSnapshot;
        setPurposes(funds.purposes);
        setPurposeId((current) => current || funds.purposes[0]?.id || '');
      }
    } catch (error) {
      console.error('Sharing load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await load();
      if (cancelled) return;
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [load, refreshKey]);

  const togglePermission = (permission: string) => {
    setPermissions((current) => (
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    ));
  };

  const create = async () => {
    setCreating(true);
    setMessage('');
    setGeneratedCode('');
    try {
      const body: Record<string, unknown> = {
        share_type: shareType,
        title: title.trim(),
        description: description.trim(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };

      if (shareType === 'money') {
        const amount = parsePositive(amountLimit);
        if (amount == null) throw new Error('金額が不正です');
        if (!purposeId) throw new Error('共有先の目的を選択してください');
        body.purpose_id = purposeId;
        body.amount_limit = amount;
      } else {
        if (!resourceId) throw new Error('共有するリソースを選択してください');
        body.resource_id = resourceId;
        body.permissions = permissions;
        body.max_uses = parseNonNegativeInteger(maxUses);
      }

      const res = await fetch('/api/sharing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '共有の作成に失敗しました');

      setGeneratedCode(data.access_code);
      setTitle('');
      setDescription('');
      setAmountLimit('');
      setMaxUses('0');
      await load();
      onChanged?.();
      setMessage('共有を作成しました。下のコードを相手に渡してください。');
    } catch (error) {
      console.error('Sharing create error:', error);
      setMessage(error instanceof Error ? error.message : '共有の作成に失敗しました。');
    } finally {
      setCreating(false);
    }
  };

  const redeem = async () => {
    if (!redeemCode.trim()) {
      setMessage('共有コードを入力してください。');
      return;
    }

    setRedeeming(true);
    setMessage('');
    try {
      const res = await fetch('/api/sharing/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '共有コードの利用に失敗しました');
      setRedeemCode('');
      await load();
      setMessage('共有を利用できるようになりました。');
    } catch (error) {
      console.error('Sharing redeem error:', error);
      setMessage(error instanceof Error ? error.message : '共有コードの利用に失敗しました。');
    } finally {
      setRedeeming(false);
    }
  };

  const authorize = async (received: ReceivedShare) => {
    const { share } = received;
    const amount = share.share_type === 'money'
      ? parsePositive(useAmounts[share.id] || '')
      : null;

    if (share.share_type === 'money' && amount == null) {
      setMessage('使用する金額を入力してください。');
      return;
    }

    setAuthorizingId(share.id);
    setMessage('');
    try {
      const res = await fetch('/api/sharing/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          share_id: share.id,
          action: share.share_type === 'money' ? 'use' : (share.permissions.includes('execute') ? 'execute' : 'read'),
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.allowed) {
        throw new Error(data.reason || data.error || '利用できませんでした');
      }

      setUseAmounts((current) => ({ ...current, [share.id]: '' }));
      await load();
      onChanged?.();
      setMessage('利用を記録しました。');
    } catch (error) {
      console.error('Sharing authorize error:', error);
      setMessage(error instanceof Error ? error.message : '利用の記録に失敗しました。');
    } finally {
      setAuthorizingId(null);
    }
  };

  const revoke = async (share: ResourceShare) => {
    try {
      const res = await fetch(`/api/sharing/${share.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revoked' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取消に失敗しました');
      await load();
      onChanged?.();
      setMessage('共有を取消しました。未使用の資金は返金されます。');
    } catch (error) {
      console.error('Sharing revoke error:', error);
      setMessage('共有の取消に失敗しました。');
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage('コピーに失敗しました。');
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '0.8rem' }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '0.8rem' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 0 0.4rem', fontSize: '0.85rem' }}>
        <ShieldCheck size={14} className="text-accent" />
        安全な共有
      </h3>

      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
        資金やAPI/MCPで使えるリソースを、金額上限・回数・期限・権限つきで共有できます。
      </p>

      {generatedCode && (
        <div style={{ padding: '0.5rem', marginBottom: '0.5rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '6px' }}>
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.68rem', color: '#22c55e' }}>共有コード（この画面でのみ表示）</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <code style={{ flex: 1, fontSize: '0.68rem', overflowWrap: 'anywhere' }}>{generatedCode}</code>
            <button type="button" onClick={() => void copyCode()} style={iconButtonStyle} title="コピー">
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}

      <details style={{ marginBottom: '0.5rem' }} open={false}>
        <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Plus size={11} /> 共有を作成
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              type="button"
              onClick={() => setShareType('money')}
              style={tabStyle(shareType === 'money')}
            >
              <Wallet size={11} /> 資金
            </button>
            <button
              type="button"
              onClick={() => {
                if (shareType === 'money') setShareType('resource');
              }}
              style={tabStyle(shareType !== 'money')}
            >
              <Key size={11} /> リソース
            </button>
          </div>

          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="タイトル（任意）" style={inputStyle} />
          <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="説明・利用条件（任意）" style={inputStyle} />

          {shareType === 'money' ? (
            <>
              <select value={purposeId} onChange={(event) => setPurposeId(event.target.value)} style={inputStyle}>
                {purposes.length === 0 ? (
                  <option value="">目的資金がありません</option>
                ) : (
                  purposes.map((purpose) => (
                    <option key={purpose.id} value={purpose.id}>
                      {purpose.name}（残高 ¥{Number(purpose.balance).toLocaleString()}）
                    </option>
                  ))
                )}
              </select>
              <input type="text" inputMode="decimal" value={amountLimit} onChange={(event) => setAmountLimit(event.target.value)} placeholder="共有する金額" style={inputStyle} />
            </>
          ) : (
            <>
              <select
                value={shareType}
                onChange={(event) => setShareType(event.target.value as ShareType)}
                style={inputStyle}
              >
                <option value="resource">リソース（ツール・接続）</option>
                <option value="api">API</option>
                <option value="mcp">MCP</option>
              </select>
              <select value={resourceId} onChange={(event) => setResourceId(event.target.value)} style={inputStyle}>
                {resources.length === 0 ? (
                  <option value="">共有できるリソースがありません</option>
                ) : (
                  resources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}（{resource.resource_type}）
                    </option>
                  ))
                )}
              </select>
              <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={permissions.includes('read')} onChange={() => togglePermission('read')} /> 参照
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={permissions.includes('execute')} onChange={() => togglePermission('execute')} /> 実行
                </label>
              </div>
              <input type="text" inputMode="numeric" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="最大利用回数（0 = 無制限）" style={inputStyle} />
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            <Clock3 size={11} /> 有効期限
            <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </label>

          <button type="button" onClick={() => void create()} disabled={creating} style={buttonStyle(creating)}>
            {creating ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
            共有コードを発行
          </button>
        </div>
      </details>

      <details style={{ marginBottom: '0.5rem' }}>
        <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Key size={11} /> 共有コードを使う
        </summary>
        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
          <input type="text" value={redeemCode} onChange={(event) => setRedeemCode(event.target.value)} placeholder="shr_..." style={inputStyle} />
          <button type="button" onClick={() => void redeem()} disabled={redeeming} style={{ ...buttonStyle(redeeming), width: 'auto', flexShrink: 0 }}>
            {redeeming ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          </button>
        </div>
      </details>

      {message && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{message}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {snapshot.owned.length === 0 && snapshot.received.length === 0 && (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>共有はまだありません。</p>
        )}

        {snapshot.owned.map((share) => (
          <ShareCard key={share.id} share={share} onRevoke={() => void revoke(share)} />
        ))}

        {snapshot.received.map((received) => (
          <div
            key={received.grant.id}
            style={{ padding: '0.5rem 0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {received.share.title}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                {SHARE_TYPE_LABEL[received.share.share_type]} / {STATUS_LABEL[received.share.status]}
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {received.share.share_type === 'money'
                ? `残り ¥${Math.max(0, Number(received.share.amount_limit) - Number(received.share.amount_used)).toLocaleString()}`
                : `利用 ${received.grant.used_count}回${Number(received.share.max_uses) > 0 ? ` / ${received.share.max_uses}回` : ''}`}
              {received.grant.expires_at ? ` / 期限 ${new Date(received.grant.expires_at).toLocaleDateString()}` : ''}
            </p>

            {received.share.status === 'active' && received.grant.status === 'active' && (
              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.35rem' }}>
                {received.share.share_type === 'money' && (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={useAmounts[received.share.id] || ''}
                    onChange={(event) => setUseAmounts((current) => ({ ...current, [received.share.id]: event.target.value }))}
                    placeholder="使用金額"
                    style={inputStyle}
                  />
                )}
                <button
                  type="button"
                  onClick={() => void authorize(received)}
                  disabled={authorizingId === received.share.id}
                  style={{ ...buttonStyle(authorizingId === received.share.id), width: 'auto', flexShrink: 0 }}
                >
                  {authorizingId === received.share.id ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                  利用
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {events.length > 0 && (
        <details style={{ marginTop: '0.6rem' }}>
          <summary style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            共有の利用履歴
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.35rem' }}>
            {events.slice(0, 10).map((event) => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                <span>{EVENT_LABEL[event.action] || event.action}</span>
                {event.amount != null && <span>¥{Number(event.amount).toLocaleString()}</span>}
                <span style={{ marginLeft: 'auto' }}>{new Date(event.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ShareCard({ share, onRevoke }: { share: ResourceShare; onRevoke: () => void }) {
  const remainingAmount = Math.max(0, Number(share.amount_limit) - Number(share.amount_used));
  const remainingUses = Number(share.max_uses) > 0
    ? Math.max(0, Number(share.max_uses) - Number(share.used_count))
    : null;

  return (
    <div style={{ padding: '0.5rem 0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.78rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {share.title}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
          {SHARE_TYPE_LABEL[share.share_type]} / {STATUS_LABEL[share.status] || share.status}
        </span>
      </div>
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
        コード: {share.access_code_prefix}...
        {share.share_type === 'money'
          ? ` / 残り ¥${remainingAmount.toLocaleString()}`
          : ` / 利用 ${share.used_count}回${remainingUses != null ? `（残り${remainingUses}回）` : ''}`}
        {share.expires_at ? ` / 期限 ${new Date(share.expires_at).toLocaleDateString()}` : ''}
      </p>
      {share.status === 'active' && (
        <button
          type="button"
          onClick={onRevoke}
          style={{
            marginTop: '0.35rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            padding: '0.2rem 0.4rem',
            fontSize: '0.65rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '5px',
            color: '#ef4444',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={10} /> 取消
        </button>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.35rem 0.45rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--glass-border)',
  borderRadius: '6px',
  color: 'white',
  fontSize: '0.75rem',
};

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.25rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--glass-border)',
  borderRadius: '4px',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '0.38rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    fontSize: '0.72rem',
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.35)',
    borderRadius: '6px',
    color: 'var(--accent-color)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '0.3rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.2rem',
    fontSize: '0.7rem',
    background: active ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    color: active ? 'var(--accent-color)' : 'var(--text-secondary)',
    cursor: 'pointer',
  };
}
