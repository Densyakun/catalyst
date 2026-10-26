'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Inbox,
  Lightbulb,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Send,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { todayFocusKey } from '@/lib/types/today';
import type { TodayData, TodayFocus, TodayUrgency } from '@/lib/types/today';
import ExecutionView, { type ExecutionResultData } from './ExecutionView';
import Onboarding from './Onboarding';

export type NavTab = 'today' | 'issues' | 'plan' | 'connect' | 'cloud' | 'settings';

interface TodayViewProps {
  username: string;
  onNavigate: (tab: NavTab) => void;
  onConsult?: (focus: TodayFocus) => void;
  refreshKey?: number;
  onDataChanged?: () => void;
  focusKey?: string | null;
  onFocusChange?: (key: string | null) => void;
}

const URGENCY_META: Record<TodayUrgency, { label: string; color: string; bg: string; border: string }> = {
  high: { label: '緊急', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.35)' },
  medium: { label: '重要', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)' },
  low: { label: '通常', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', border: 'rgba(107, 114, 128, 0.35)' },
};

export default function TodayView({
  username,
  onNavigate,
  onConsult,
  refreshKey = 0,
  onDataChanged,
  focusKey = null,
  onFocusChange,
}: TodayViewProps) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [capture, setCapture] = useState('');
  const [captureSending, setCaptureSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [thread, setThread] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [captureNotice, setCaptureNotice] = useState<{
    type: string;
    ideaSaved: boolean;
    feedbackSaved: boolean;
  } | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const [executing, setExecuting] = useState(false);
  const [execution, setExecution] = useState<{
    result: ExecutionResultData;
    actionId: string | null;
    description: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/today');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '読み込みに失敗しました');
      const nextData = json as TodayData;
      setData(nextData);
      setError('');
      setShowOnboarding(
        nextData.isNewUser && localStorage.getItem('katalyse_onboarding_done') !== '1',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  const candidates = useMemo<TodayFocus[]>(() => {
    if (!data) return [];
    return [data.focus, ...data.upNext].filter((item): item is TodayFocus => Boolean(item));
  }, [data]);

  const focus = candidates.find((item) => todayFocusKey(item) === focusKey) ?? candidates[0] ?? null;
  const defaultFocusKey = data?.focus ? todayFocusKey(data.focus) : null;
  const currentFocusKey = focus ? todayFocusKey(focus) : null;

  const selectFocus = (key: string | null) => {
    onFocusChange?.(key);
  };

  const executeFocus = async () => {
    if (!focus?.action || !focus.problem || executing) return;
    setExecuting(true);
    setError('');
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: focus.action, problem: focus.problem }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '実行計画の作成に失敗しました');
      setExecution({
        result: json as ExecutionResultData,
        actionId: focus.action.id,
        description: focus.action.description,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const updateInsight = async (action: 'proceed' | 'hold') => {
    if (!focus?.insight) return;
    try {
      await fetch(`/api/insights/${focus.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      selectFocus(null);
      await load();
      onDataChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [thread, captureSending]);

  const sendCapture = async () => {
    const message = capture.trim();
    if (!message || captureSending) return;
    setCaptureSending(true);
    setError('');
    const isFollowUp = Boolean(conversationId);
    setThread((prev) => [...prev, { role: 'user', content: message }]);
    setCapture('');
    if (!isFollowUp) setCaptureNotice(null);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversation_id: conversationId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '送信に失敗しました');
      setConversationId(json.conversation_id ?? conversationId);
      setThread((prev) => [
        ...prev,
        { role: 'assistant', content: json.reply?.content || '受け取りました' },
      ]);
      setCaptureNotice({
        type: json.capture_type || 'question',
        ideaSaved: Boolean(json.idea_saved),
        feedbackSaved: Boolean(json.feedback_saved),
      });
      await load();
      onDataChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCaptureSending(false);
    }
  };

  const startNewCapture = () => {
    setThread([]);
    setConversationId(null);
    setCaptureNotice(null);
    setCapture('');
  };

  const markNotUrgent = async () => {
    if (!focus) return;
    try {
      const res = await fetch('/api/today/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: focus.kind, id: focus.id, action: 'not_urgent' }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || '緊急度を更新できませんでした');
      }
      selectFocus(null);
      await load();
      onDataChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';
  const todayLabel = new Date().toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', display: 'grid', gap: '0.8rem' }}>
      <section style={{ padding: '0.2rem 0.1rem' }}>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{todayLabel}</p>
        <h2 style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', margin: '0.1rem 0' }}>
          {greeting}、{username}さん
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {focus
            ? '今日はこの1つから始めましょう。終わったら結果を1タップで記録できます。'
            : 'まずは今の状況を1つ教えてください。AIが整理して、次の一歩を提案します。'}
        </p>
      </section>

      {showOnboarding && (
        <Onboarding
          onComplete={() => {
            setShowOnboarding(false);
            void load();
            onDataChanged?.();
          }}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      <div className="glass-panel" style={{ padding: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
          <Sparkles size={14} className="text-accent" />
          <h3 style={{ fontSize: '0.9rem', margin: 0 }}>今の状況を書く</h3>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          困りごと・思いつき・アプリへの要望を、そのまま書いてください。自動で振り分けます。
          {thread.length > 0 && ' AIの回答には、そのまま続けて質問できます。'}
        </p>

        {thread.length > 0 && (
          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              marginBottom: '0.6rem',
              padding: '0.5rem',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
            }}
          >
            {thread.map((message, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '0.45rem 0.6rem',
                    borderRadius:
                      message.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                    background:
                      message.role === 'user'
                        ? 'rgba(99, 102, 241, 0.3)'
                        : 'rgba(255,255,255,0.05)',
                    fontSize: '0.78rem',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {captureSending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '0.45rem 0.6rem',
                    borderRadius: '10px 10px 10px 2px',
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Loader2 className="animate-spin" size={12} />
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <textarea
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void sendCapture();
              }
            }}
            placeholder={
              conversationId
                ? 'AIの回答について、続けて聞きたいことを入力...'
                : '例: 副業の準備が進まない。夜に1時間は使える。'
            }
            rows={2}
            style={{
              flex: 1,
              minWidth: 0,
              resize: 'vertical',
              padding: '0.55rem 0.65rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              color: 'white',
              fontFamily: 'inherit',
              fontSize: '0.82rem',
            }}
          />
          <button
            type="button"
            onClick={() => void sendCapture()}
            disabled={!capture.trim() || captureSending}
            className="btn-primary"
            style={{
              padding: '0.55rem 0.8rem',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              opacity: !capture.trim() || captureSending ? 0.6 : 1,
            }}
          >
            {captureSending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
            {conversationId ? '返信' : '送る'}
          </button>
        </div>

        {thread.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              Ctrl / ⌘ + Enter でも送信できます
            </span>
            <button
              type="button"
              onClick={startNewCapture}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.68rem',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              新しい会話を始める
            </button>
          </div>
        )}

        {captureNotice && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginTop: '0.6rem',
              padding: '0.45rem 0.6rem',
              background: captureNotice.feedbackSaved
                ? 'rgba(59, 130, 246, 0.1)'
                : captureNotice.ideaSaved
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(34, 197, 94, 0.08)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              fontSize: '0.68rem',
              color: captureNotice.feedbackSaved
                ? '#60a5fa'
                : captureNotice.ideaSaved
                  ? '#f59e0b'
                  : '#4ade80',
            }}
          >
            {captureNotice.feedbackSaved
              ? 'アプリへの要望として記録しました。改善に活用します。'
              : captureNotice.ideaSaved
                ? 'アイデアとして保存しました。後でAIが整理します。'
                : captureNotice.type === 'problem'
                  ? '課題として整理しました。今日の候補を確認してください。'
                  : '内容を受け取りました。続けて質問できます。'}
          </motion.div>
        )}
      </div>

      {loading && (
        <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <Loader2 className="animate-spin" size={16} /> 今日の状況を整理しています...
        </div>
      )}

      {!loading && error && (
        <div className="glass-panel" style={{ padding: '0.9rem', border: '1px solid rgba(239, 68, 68, 0.35)', fontSize: '0.78rem', color: '#f87171' }}>
          {error}
          <button
            type="button"
            onClick={() => void load()}
            style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.75rem', padding: 0 }}
          >
            再読み込み
          </button>
        </div>
      )}

      {execution ? (
        <ExecutionView
          result={execution.result}
          actionId={execution.actionId}
          actionDescription={execution.description}
          onBack={() => {
            setExecution(null);
            void load();
            onDataChanged?.();
          }}
          backLabel="今日に戻る"
          onOutcomeSubmitted={() => {
            void load();
            onDataChanged?.();
          }}
        />
      ) : focus ? (
        <FocusCard
          focus={focus}
          heading={currentFocusKey === defaultFocusKey ? '今日の1つ' : '選んだ候補'}
          executing={executing}
          onExecute={() => void executeFocus()}
          onInsightAction={(action) => void updateInsight(action)}
          onConsult={() => (onConsult ? onConsult(focus) : onNavigate('issues'))}
          onNotUrgent={() => void markNotUrgent()}
        />
      ) : (
        !loading && (
          <div className="glass-panel" style={{ padding: '1.4rem', textAlign: 'center' }}>
            <Target size={24} className="text-accent" style={{ marginBottom: '0.4rem' }} />
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.2rem' }}>候補はまだありません</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              上の入力欄に今の状況を書くか、診断をはじめてください。
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onNavigate('issues')}
              style={{ marginTop: '0.7rem', padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              診断をはじめる <ArrowRight size={14} />
            </button>
          </div>
        )
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
          <StatCard
            icon={<Zap size={14} />}
            label="未解決の課題"
            value={data.stats.unsolvedProblems}
            onClick={() => onNavigate('issues')}
          />
          <StatCard
            icon={<Lightbulb size={14} />}
            label="AIの気づき"
            value={data.stats.pendingInsights}
            onClick={() => onNavigate('issues')}
          />
          <StatCard
            icon={<Inbox size={14} />}
            label="アイデア"
            value={data.stats.pendingIdeas}
            onClick={() => onNavigate('issues')}
          />
          <StatCard
            icon={<FolderKanban size={14} />}
            label="進行中"
            value={data.stats.activeProjects}
            onClick={() => onNavigate('plan')}
          />
          <StatCard
            icon={<CheckCircle2 size={14} />}
            label="解決済み"
            value={data.stats.solvedProblems}
            onClick={() => onNavigate('issues')}
          />
        </div>
      )}

      {data && candidates.length > 0 && (
        <div className="glass-panel" style={{ padding: '0.8rem' }}>
          <h3 style={{ fontSize: '0.85rem', marginBottom: '0.1rem' }}>今日の候補</h3>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            選ぶと上の「今日の1つ」が切り替わります。ここからいつでも元の候補に戻せます。
          </p>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {candidates.map((item) => {
              const key = todayFocusKey(item);
              const isCurrent = key === currentFocusKey;
              const isDefault = key === defaultFocusKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    selectFocus(key);
                    setExecution(null);
                  }}
                  aria-current={isCurrent ? 'true' : undefined}
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem 0.6rem',
                    background: isCurrent ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isCurrent ? 'rgba(99, 102, 241, 0.55)' : 'var(--glass-border)'}`,
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: URGENCY_META[item.urgency].color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                  {isCurrent ? (
                    <span style={{ fontSize: '0.62rem', color: 'var(--accent-color)', flexShrink: 0 }}>
                      表示中
                    </span>
                  ) : isDefault ? (
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                      今日の1つ
                    </span>
                  ) : null}
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {item.kind === 'problem' ? '課題' : '気づき'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FocusCard({
  focus,
  heading,
  executing,
  onExecute,
  onInsightAction,
  onConsult,
  onNotUrgent,
}: {
  focus: TodayFocus;
  heading: string;
  executing: boolean;
  onExecute: () => void;
  onInsightAction: (action: 'proceed' | 'hold') => void;
  onConsult: () => void;
  onNotUrgent: () => void;
}) {
  const urgency = URGENCY_META[focus.urgency];

  return (
    <motion.div
      layout
      className="glass-panel"
      style={{
        padding: 'clamp(1rem, 3vw, 1.4rem)',
        border: `1px solid ${focus.urgency === 'high' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)'}`,
        background:
          focus.urgency === 'high'
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.07), rgba(20, 20, 20, 0.7))'
            : 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.04))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {heading}
        </span>
        <span
          style={{
            padding: '0.1rem 0.4rem',
            borderRadius: '999px',
            background: urgency.bg,
            border: `1px solid ${urgency.border}`,
            color: urgency.color,
            fontSize: '0.65rem',
            fontWeight: 600,
          }}
        >
          {urgency.label}
        </span>
        <span
          style={{
            padding: '0.1rem 0.4rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-secondary)',
            fontSize: '0.65rem',
          }}
        >
          {focus.kind === 'problem' ? '課題' : 'AIの気づき'}
        </span>
        {focus.cost?.time && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
            <Clock3 size={10} /> {focus.cost.time}
          </span>
        )}
      </div>

      <h2 style={{ fontSize: 'clamp(1.1rem, 2.4vw, 1.4rem)', marginBottom: '0.4rem', overflowWrap: 'anywhere' }}>
        {focus.title}
      </h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>
        {focus.description}
      </p>
      {focus.goal && (
        <p style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>ゴール: </span>
          {focus.goal}
        </p>
      )}
      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>{focus.reason}</p>

      {focus.nextStep && (
        <div
          style={{
            padding: '0.7rem 0.8rem',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: '10px',
            border: '1px solid var(--glass-border)',
            marginBottom: '0.7rem',
          }}
        >
          <p style={{ fontSize: '0.66rem', color: 'var(--accent-color)', marginBottom: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Target size={11} /> 次の一歩
          </p>
          <p style={{ fontSize: '0.85rem', overflowWrap: 'anywhere' }}>{focus.nextStep}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {focus.kind === 'problem' && focus.action && (
          <button
            type="button"
            onClick={onExecute}
            disabled={executing}
            className="btn-primary"
            style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            {executing ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
            {executing ? '実行計画を作成中...' : 'この一歩を実行'}
          </button>
        )}
        {focus.kind === 'insight' && (
          <>
            <button
              type="button"
              onClick={() => onInsightAction('proceed')}
              className="btn-primary"
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Play size={14} /> 進める
            </button>
            <button
              type="button"
              onClick={() => onInsightAction('hold')}
              style={{
                padding: '0.5rem 0.9rem',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                color: 'white',
              }}
            >
              <Pause size={14} /> 保留
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onConsult}
          style={{
            padding: '0.5rem 0.9rem',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--glass-border)',
            borderRadius: '8px',
            color: 'white',
          }}
        >
          <MessageSquare size={14} /> この課題について相談
        </button>
        {focus.urgency !== 'low' && (
          <button
            type="button"
            onClick={onNotUrgent}
            title="AIの緊急度判定が実感と違うときに下げられます"
            style={{
              padding: '0.5rem 0.9rem',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'none',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <ArrowDown size={14} /> {focus.urgency === 'high' ? '緊急ではない' : '重要ではない'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function StatCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '0.6rem 0.7rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--glass-border)',
        borderRadius: '10px',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span style={{ color: 'var(--accent-color)' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '1rem', fontWeight: 700, lineHeight: 1.1 }}>{value}</span>
        <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{label}</span>
      </span>
    </button>
  );
}
