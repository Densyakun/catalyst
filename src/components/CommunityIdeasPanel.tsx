'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Target,
  Users,
  Wallet,
} from 'lucide-react';
import type { AutoInsight } from '@/lib/types/sources';
import type {
  SharedIdea,
  SharedIdeaStatus,
  SupportType,
} from '@/lib/types/community';

const SUPPORT_TYPES: SupportType[] = ['money', 'time', 'skill'];

const SUPPORT_LABEL: Record<SupportType, string> = {
  money: '資金',
  time: '時間',
  skill: 'スキル',
};

const STATUS_META: Record<SharedIdeaStatus, { label: string; color: string; bg: string }> = {
  open: { label: '募集中', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  in_progress: { label: '進行中', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  completed: { label: '完了', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  closed: { label: '終了', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
};

function parseNonNegative(value: string): number | null {
  if (!value.trim()) return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function parsePositive(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export default function CommunityIdeasPanel({
  refreshKey = 0,
  onSupported,
}: {
  refreshKey?: number;
  onSupported?: () => void;
}) {
  const [ideas, setIdeas] = useState<SharedIdea[]>([]);
  const [insights, setInsights] = useState<AutoInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [supporting, setSupporting] = useState(false);
  const [message, setMessage] = useState('');

  const [insightId, setInsightId] = useState('');
  const [summary, setSummary] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [tags, setTags] = useState('');
  const [neededSupport, setNeededSupport] = useState<SupportType[]>(SUPPORT_TYPES);

  const [activeSupport, setActiveSupport] = useState<{ ideaId: string; type: SupportType } | null>(null);
  const [supportAmount, setSupportAmount] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [ideasRes, insightsRes] = await Promise.all([
        fetch('/api/community/ideas'),
        fetch('/api/insights'),
      ]);
      if (ideasRes.ok) setIdeas(await ideasRes.json());
      if (insightsRes.ok) {
        const nextInsights = (await insightsRes.json() as AutoInsight[])
          .filter((insight) => insight.insight_type === 'suggestion');
        setInsights(nextInsights);
        setInsightId((current) => current || nextInsights[0]?.id || '');
      }
    } catch (error) {
      console.error('Community ideas load error:', error);
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

  const toggleSupportType = (type: SupportType) => {
    setNeededSupport((current) => (
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type]
    ));
  };

  const publish = async () => {
    if (!insightId) {
      setMessage('共有するアイデアを選択してください。');
      return;
    }
    const target = parseNonNegative(targetAmount);
    if (target == null) {
      setMessage('目標金額が不正です。');
      return;
    }

    setPublishing(true);
    setMessage('');
    try {
      const res = await fetch('/api/community/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insight_id: insightId,
          summary,
          target_amount: target,
          tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          needed_support: neededSupport,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '公開に失敗しました');
      setSummary('');
      setTargetAmount('');
      setTags('');
      await load();
      setMessage('共有アイデアとして公開しました。');
    } catch (error) {
      console.error('Community idea publish error:', error);
      setMessage('共有アイデアの公開に失敗しました。');
    } finally {
      setPublishing(false);
    }
  };

  const submitSupport = async () => {
    if (!activeSupport) return;
    const { ideaId, type } = activeSupport;
    const amount = type === 'money' ? parsePositive(supportAmount) : null;
    if (type === 'money' && amount == null) {
      setMessage('金額が不正です。');
      return;
    }

    setSupporting(true);
    setMessage('');
    try {
      const res = await fetch(`/api/community/ideas/${ideaId}/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          support_type: type,
          amount,
          message: supportMessage.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '支援に失敗しました');
      setActiveSupport(null);
      setSupportAmount('');
      setSupportMessage('');
      await load();
      onSupported?.();
      setMessage(type === 'money' ? '資金支援を記録しました。' : '協力の申し出を記録しました。');
    } catch (error) {
      console.error('Community idea support error:', error);
      setMessage('支援の記録に失敗しました。');
    } finally {
      setSupporting(false);
    }
  };

  const updateStatus = async (id: string, status: SharedIdeaStatus) => {
    try {
      const res = await fetch(`/api/community/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      await load();
      setMessage('状態を更新しました。');
    } catch (error) {
      console.error('Community idea status error:', error);
      setMessage('状態の更新に失敗しました。');
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
        <Users size={14} className="text-accent" />
        みんなのアイデア
        {ideas.filter((idea) => idea.status === 'open').length > 0 && (
          <span
            style={{
              padding: '0.1rem 0.4rem',
              background: 'rgba(34, 197, 94, 0.15)',
              borderRadius: '10px',
              fontSize: '0.7rem',
              color: '#22c55e',
            }}
          >
            {ideas.filter((idea) => idea.status === 'open').length}
          </span>
        )}
      </h3>

      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
        自分のアイデアを公開したり、他の人のアイデアに資金・時間・スキルで協力できます。
      </p>

      <details style={{ marginBottom: '0.6rem' }}>
        <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Plus size={11} /> 自分のアイデアを公開
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
          <select
            value={insightId}
            onChange={(event) => setInsightId(event.target.value)}
            style={inputStyle}
          >
            {insights.length === 0 ? (
              <option value="">共有できるアイデアがありません</option>
            ) : (
              insights.map((insight) => (
                <option key={insight.id} value={insight.id}>
                  {insight.title}
                </option>
              ))
            )}
          </select>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="補足説明（任意）"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <input
            type="text"
            inputMode="decimal"
            value={targetAmount}
            onChange={(event) => setTargetAmount(event.target.value)}
            placeholder="目標金額（任意）"
            style={inputStyle}
          />
          <input
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="関連タグ（カンマ区切り）"
            style={inputStyle}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {SUPPORT_TYPES.map((type) => (
              <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={neededSupport.includes(type)}
                  onChange={() => toggleSupportType(type)}
                />
                {SUPPORT_LABEL[type]}
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void publish()} disabled={publishing} style={buttonStyle(publishing)}>
            {publishing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            公開する
          </button>
        </div>
      </details>

      {message && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{message}</p>
      )}

      {ideas.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          共有されたアイデアはまだありません。
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ideas.map((idea) => {
            const meta = STATUS_META[idea.status] ?? STATUS_META.open;
            const target = Number(idea.target_amount);
            const funded = Number(idea.funded_amount);
            const ratio = target > 0 ? Math.min(100, (funded / target) * 100) : 0;

            return (
              <div
                key={idea.id}
                style={{
                  padding: '0.55rem 0.6rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                  <span style={{ fontSize: '0.8rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {idea.title}
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

                {idea.summary && (
                  <p
                    style={{
                      margin: '0.3rem 0 0',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {idea.summary}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem', fontSize: '0.65rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  {idea.category && <span>{idea.category}</span>}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                    <Users size={10} /> {idea.supporter_count}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                    <Wallet size={10} /> ¥{funded.toLocaleString()}
                    {target > 0 && ` / ¥${target.toLocaleString()}`}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                    <Clock3 size={10} /> {new Date(idea.created_at).toLocaleDateString()}
                  </span>
                </div>

                {target > 0 && (
                  <div style={{ height: '3px', marginTop: '0.3rem', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${ratio}%`, height: '100%', background: 'var(--accent-color)' }} />
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                  {idea.needed_support.map((type) => {
                    const already = type !== 'money' && idea.supported_types.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={already}
                        onClick={() => {
                          setActiveSupport({ ideaId: idea.id, type });
                          setSupportAmount('');
                          setSupportMessage('');
                        }}
                        style={{
                          padding: '0.22rem 0.45rem',
                          fontSize: '0.68rem',
                          background: already ? 'rgba(255,255,255,0.03)' : 'rgba(99, 102, 241, 0.12)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: '5px',
                          color: already ? 'var(--text-secondary)' : 'var(--accent-color)',
                          cursor: already ? 'default' : 'pointer',
                          opacity: already ? 0.6 : 1,
                        }}
                      >
                        {already ? `${SUPPORT_LABEL[type]}で支援済み` : `${SUPPORT_LABEL[type]}で支援`}
                      </button>
                    );
                  })}
                </div>

                {activeSupport?.ideaId === idea.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid var(--glass-border)' }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {SUPPORT_LABEL[activeSupport.type]}で支援する
                    </p>
                    {activeSupport.type === 'money' && (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={supportAmount}
                        onChange={(event) => setSupportAmount(event.target.value)}
                        placeholder="金額"
                        style={inputStyle}
                      />
                    )}
                    <input
                      type="text"
                      value={supportMessage}
                      onChange={(event) => setSupportMessage(event.target.value)}
                      placeholder="メッセージ（任意）"
                      style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button type="button" onClick={() => void submitSupport()} disabled={supporting} style={{ ...buttonStyle(supporting), flex: 1 }}>
                        {supporting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        送信
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSupport(null)}
                        style={{
                          flex: 1,
                          padding: '0.35rem',
                          fontSize: '0.7rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '6px',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}

                {idea.is_owner && idea.status !== 'completed' && idea.status !== 'closed' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid var(--glass-border)' }}>
                    {idea.status === 'open' && (
                      <SmallButton onClick={() => void updateStatus(idea.id, 'in_progress')}>進行中にする</SmallButton>
                    )}
                    <SmallButton onClick={() => void updateStatus(idea.id, 'completed')}>
                      <CheckCircle2 size={10} /> 完了
                    </SmallButton>
                    <SmallButton onClick={() => void updateStatus(idea.id, 'closed')}>終了</SmallButton>
                  </div>
                )}

                {idea.is_owner && idea.supporters && idea.supporters.length > 0 && (
                  <details style={{ marginTop: '0.4rem' }}>
                    <summary style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <Target size={10} /> 支援者 {idea.supporters.length}件
                    </summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.3rem' }}>
                      {idea.supporters.slice(0, 5).map((supporter) => (
                        <div key={supporter.id} style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                          {SUPPORT_LABEL[supporter.support_type]}
                          {supporter.amount != null ? ` ¥${Number(supporter.amount).toLocaleString()}` : ''}
                          {supporter.message ? ` — ${supporter.message}` : ''}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.15rem',
        padding: '0.2rem 0.4rem',
        fontSize: '0.65rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--glass-border)',
        borderRadius: '5px',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
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
