'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Plus,
  Send,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { FundPurpose, FundsSnapshot, FundingSource } from '@/lib/types/funds';
import type { BillingInfo, PaymentRecord } from '@/lib/types/billing';

const SOURCE_LABEL: Record<FundingSource, string> = {
  purpose: '目的資金',
  user: 'ユーザー残高',
  donation_pool: '寄付プール',
  split: '複数資金の組み合わせ',
  none: '資金不足',
};

const TRANSACTION_LABEL: Record<string, string> = {
  donation: '寄付',
  spend: '支出',
  refund: '返金',
  allocation: '配分',
};

const PAYMENT_STATUS_LABEL: Record<PaymentRecord['status'], string> = {
  pending: '処理中',
  succeeded: '完了',
  failed: '失敗',
  refunded: '返金済み',
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

export default function FundsPanel({
  refreshKey = 0,
  onDonated,
}: {
  refreshKey?: number;
  onDonated?: () => void;
}) {
  const [data, setData] = useState<FundsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [donating, setDonating] = useState(false);
  const [spending, setSpending] = useState(false);
  const [message, setMessage] = useState('');

  const [purposeName, setPurposeName] = useState('');
  const [purposeDescription, setPurposeDescription] = useState('');
  const [purposeTarget, setPurposeTarget] = useState('');

  const [selectedPurposeId, setSelectedPurposeId] = useState('');
  const [donateAmount, setDonateAmount] = useState('');
  const [donateMessage, setDonateMessage] = useState('');

  const [spendPurposeId, setSpendPurposeId] = useState('');
  const [spendAmount, setSpendAmount] = useState('');
  const [spendNote, setSpendNote] = useState('');

  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedPackId, setSelectedPackId] = useState('');
  const [purchasePurposeId, setPurchasePurposeId] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    const payment = new URLSearchParams(window.location.search).get('payment');
    if (payment === 'success') {
      return '決済を受け付けました。残高への反映まで少しお待ちください。';
    }
    if (payment === 'cancel') return '決済をキャンセルしました。';
    return '';
  });

  const load = useCallback(async () => {
    try {
      const [fundsRes, billingRes, paymentsRes] = await Promise.all([
        fetch('/api/funds'),
        fetch('/api/billing/packs'),
        fetch('/api/billing/payments'),
      ]);
      if (fundsRes.ok) {
        const next = await fundsRes.json() as FundsSnapshot;
        setData(next);
        if (next.purposes.length > 0) {
          setSelectedPurposeId((current) => current || next.purposes[0].id);
          const firstOwned = next.purposes.find((purpose) => purpose.is_owner);
          if (firstOwned) {
            setSpendPurposeId((current) => current || firstOwned.id);
          }
        }
      }
      if (billingRes.ok) {
        const next = await billingRes.json() as BillingInfo;
        setBilling(next);
        if (next.packs.length > 0) {
          setSelectedPackId((current) => current || next.packs[0].id);
        }
      }
      if (paymentsRes.ok) {
        const next = await paymentsRes.json() as { payments?: PaymentRecord[] };
        setPayments(next.payments || []);
      }
    } catch (error) {
      console.error('Funds load error:', error);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payment = new URLSearchParams(window.location.search).get('payment');
    if (payment !== 'success') return;
    const timer = window.setTimeout(() => { void load(); }, 4000);
    return () => window.clearTimeout(timer);
  }, [load]);

  const purchase = async () => {
    if (!selectedPackId) {
      setPurchaseMessage('購入するプランを選択してください。');
      return;
    }
    setPurchasing(true);
    setPurchaseMessage('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack_id: selectedPackId,
          purpose_id: purchasePurposeId || undefined,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || '決済を開始できませんでした');
      if (typeof result.url !== 'string' || !result.url) {
        throw new Error('決済ページを開けませんでした');
      }
      window.location.href = result.url;
    } catch (error) {
      console.error('Billing checkout error:', error);
      setPurchaseMessage(error instanceof Error ? error.message : String(error));
      setPurchasing(false);
    }
  };

  const createPurpose = async () => {
    const name = purposeName.trim();
    if (!name) {
      setMessage('目的の名前を入力してください。');
      return;
    }
    const target = parseNonNegative(purposeTarget);
    if (target == null) {
      setMessage('目標金額が不正です。');
      return;
    }

    setCreating(true);
    setMessage('');
    try {
      const res = await fetch('/api/funds/purposes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: purposeDescription.trim(),
          target_amount: target,
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error || '作成に失敗しました');
      setPurposeName('');
      setPurposeDescription('');
      setPurposeTarget('');
      await load();
      setSelectedPurposeId(created.id);
      setMessage('目的資金を作成しました。');
    } catch (error) {
      console.error('Fund purpose create error:', error);
      setMessage('目的資金の作成に失敗しました。');
    } finally {
      setCreating(false);
    }
  };

  const donate = async () => {
    if (!selectedPurposeId) {
      setMessage('寄付先の目的を選択してください。');
      return;
    }
    const amount = parsePositive(donateAmount);
    if (amount == null) {
      setMessage('金額が不正です。');
      return;
    }

    setDonating(true);
    setMessage('');
    try {
      const res = await fetch('/api/funds/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose_id: selectedPurposeId,
          amount,
          message: donateMessage.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '寄付に失敗しました');
      setDonateAmount('');
      setDonateMessage('');
      await load();
      onDonated?.();
      setMessage('寄付を記録しました。');
    } catch (error) {
      console.error('Donation error:', error);
      setMessage('寄付の記録に失敗しました。');
    } finally {
      setDonating(false);
    }
  };

  const spend = async () => {
    if (!spendPurposeId) {
      setMessage('支出元の目的を選択してください。');
      return;
    }
    const amount = parsePositive(spendAmount);
    if (amount == null) {
      setMessage('金額が不正です。');
      return;
    }

    setSpending(true);
    setMessage('');
    try {
      const res = await fetch('/api/funds/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose_id: spendPurposeId,
          amount,
          note: spendNote.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '支出に失敗しました');
      setSpendAmount('');
      setSpendNote('');
      await load();
      onDonated?.();
      setMessage('支出を記録しました。');
    } catch (error) {
      console.error('Fund spend error:', error);
      setMessage('支出の記録に失敗しました。');
    } finally {
      setSpending(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '0.8rem' }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  const purposes = data?.purposes || [];
  const ownedPurposes = purposes.filter((purpose) => purpose.is_owner);
  const plan = data?.recommended_plan;

  return (
    <div className="glass-panel" style={{ padding: '0.8rem' }}>
      <h3
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          margin: '0 0 0.6rem 0',
          fontSize: '0.85rem',
        }}
      >
        <Wallet size={14} className="text-accent" />
        資金管理
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.6rem' }}>
        <div style={{ padding: '0.45rem 0.55rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
          <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>残高</p>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.9rem', fontWeight: 600 }}>
            ¥{Number(data?.user_balance || 0).toLocaleString()}
          </p>
        </div>
        <div style={{ padding: '0.45rem 0.55rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
          <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary)' }}>寄付プール</p>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.9rem', fontWeight: 600 }}>
            ¥{Number(data?.donation_pool.balance || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {billing && (
        <div style={{ marginBottom: '0.6rem', paddingTop: '0.55rem', borderTop: '1px solid var(--glass-border)' }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <CreditCard size={11} /> クレジットを購入
          </p>
          {!billing.available ? (
            <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              購入機能は現在準備中です。
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'grid', gap: '0.3rem' }}>
                {billing.packs.map((pack) => {
                  const selected = selectedPackId === pack.id;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setSelectedPackId(pack.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.4rem 0.5rem',
                        background: selected ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selected ? 'rgba(99, 102, 241, 0.5)' : 'var(--glass-border)'}`,
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pack.label}
                      </span>
                      <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-secondary)' }}>
                        ¥{pack.amount_jpy.toLocaleString()} / {pack.credits.toLocaleString()}クレジット
                      </span>
                    </button>
                  );
                })}
              </div>
              {ownedPurposes.length > 0 && (
                <select
                  value={purchasePurposeId}
                  onChange={(event) => setPurchasePurposeId(event.target.value)}
                  style={inputStyle}
                >
                  <option value="">目的に紐づけない</option>
                  {ownedPurposes.map((purpose) => (
                    <option key={purpose.id} value={purpose.id}>
                      {purpose.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => void purchase()}
                disabled={purchasing || !selectedPackId}
                style={buttonStyle(purchasing || !selectedPackId)}
              >
                {purchasing ? <Loader2 size={11} className="animate-spin" /> : <CreditCard size={11} />}
                購入する
              </button>
              <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                購入したクレジットは残高に反映されます。目的を選ぶと購入履歴に目的が記録されます（目的は任意です）。
              </p>
              {purchaseMessage && (
                <p style={{ margin: 0, fontSize: '0.68rem', color: '#f59e0b' }}>{purchaseMessage}</p>
              )}
            </div>
          )}
        </div>
      )}

      {plan && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.35rem', marginBottom: '0.6rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          <TrendingUp size={12} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
          <span>
            次のAI処理（目安 ¥{plan.amount.toLocaleString()}）の推奨資金源:
            {' '}
            <strong style={{ color: plan.source === 'none' ? '#ef4444' : 'var(--accent-color)' }}>
              {SOURCE_LABEL[plan.source]}
            </strong>
            {plan.source === 'none' && `（¥${plan.shortfall.toLocaleString()} 不足）`}
          </span>
        </div>
      )}

      <details style={{ marginBottom: '0.6rem' }}>
        <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <Plus size={11} /> 目的資金を作成
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
          <input
            type="text"
            value={purposeName}
            onChange={(event) => setPurposeName(event.target.value)}
            placeholder="目的の名前"
            style={inputStyle}
          />
          <input
            type="text"
            value={purposeDescription}
            onChange={(event) => setPurposeDescription(event.target.value)}
            placeholder="説明（任意）"
            style={inputStyle}
          />
          <input
            type="text"
            inputMode="decimal"
            value={purposeTarget}
            onChange={(event) => setPurposeTarget(event.target.value)}
            placeholder="目標金額（任意）"
            style={inputStyle}
          />
          <button type="button" onClick={() => void createPurpose()} disabled={creating} style={buttonStyle(creating)}>
            {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            作成
          </button>
        </div>
      </details>

      {purposes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.6rem' }}>
          {purposes.slice(0, 5).map((purpose) => (
            <PurposeRow key={purpose.id} purpose={purpose} />
          ))}
        </div>
      )}

      {purposes.length > 0 && (
        <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--glass-border)' }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Target size={11} /> 目的に寄付する
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <select
              value={selectedPurposeId}
              onChange={(event) => setSelectedPurposeId(event.target.value)}
              style={inputStyle}
            >
              {purposes.map((purpose) => (
                <option key={purpose.id} value={purpose.id}>
                  {purpose.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={donateAmount}
              onChange={(event) => setDonateAmount(event.target.value)}
              placeholder="金額"
              style={inputStyle}
            />
            <input
              type="text"
              value={donateMessage}
              onChange={(event) => setDonateMessage(event.target.value)}
              placeholder="メッセージ（任意）"
              style={inputStyle}
            />
            <button type="button" onClick={() => void donate()} disabled={donating} style={buttonStyle(donating)}>
              {donating ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              寄付する
            </button>
          </div>
        </div>
      )}

      {ownedPurposes.length > 0 && (
        <details style={{ marginTop: '0.55rem' }}>
          <summary style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            目的資金から支出
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.4rem' }}>
            <select
              value={spendPurposeId}
              onChange={(event) => setSpendPurposeId(event.target.value)}
              style={inputStyle}
            >
              {ownedPurposes.map((purpose) => (
                <option key={purpose.id} value={purpose.id}>
                  {purpose.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={spendAmount}
              onChange={(event) => setSpendAmount(event.target.value)}
              placeholder="金額"
              style={inputStyle}
            />
            <input
              type="text"
              value={spendNote}
              onChange={(event) => setSpendNote(event.target.value)}
              placeholder="用途（任意）"
              style={inputStyle}
            />
            <button type="button" onClick={() => void spend()} disabled={spending} style={buttonStyle(spending)}>
              {spending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              支出を記録
            </button>
          </div>
        </details>
      )}

      {message && (
        <p style={{ margin: '0.45rem 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{message}</p>
      )}

      {payments.length > 0 && (
        <details style={{ marginTop: '0.6rem' }}>
          <summary style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            購入履歴
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.35rem' }}>
            {payments.slice(0, 5).map((payment) => {
              const purposeName = purposes.find((purpose) => purpose.id === payment.purpose_id)?.name;
              return (
                <div key={payment.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  <CreditCard size={10} style={{ flexShrink: 0 }} />
                  <span>
                    {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                    {purposeName ? ` / ${purposeName}` : ''}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'white' }}>
                    ¥{Number(payment.amount).toLocaleString()} / {Number(payment.credits).toLocaleString()}クレジット
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {(data?.transactions.length || 0) > 0 && (
        <details style={{ marginTop: '0.6rem' }}>
          <summary style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            最近の資金移動
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.35rem' }}>
            {data?.transactions.slice(0, 5).map((transaction) => (
              <div key={transaction.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
                <span>{TRANSACTION_LABEL[transaction.type] || transaction.type}</span>
                <span style={{ marginLeft: 'auto', color: 'white' }}>¥{Number(transaction.amount).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PurposeRow({ purpose }: { purpose: FundPurpose }) {
  const target = Number(purpose.target_amount);
  const balance = Number(purpose.balance);
  const ratio = target > 0 ? Math.min(100, (balance / target) * 100) : 0;

  return (
    <div style={{ padding: '0.4rem 0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem' }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {purpose.name}
        </span>
        <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
          ¥{balance.toLocaleString()}
          {target > 0 && <span style={{ color: 'var(--text-secondary)' }}> / ¥{target.toLocaleString()}</span>}
        </span>
      </div>
      {target > 0 && (
        <div style={{ height: '3px', marginTop: '0.3rem', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${ratio}%`, height: '100%', background: 'var(--accent-color)' }} />
        </div>
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
